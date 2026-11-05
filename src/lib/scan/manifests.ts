/**
 * Reads dependency manifests and names the third-party providers they point
 * at, with `package@version` and `path:line` evidence for each.
 *
 * Only structured dependency fields count. A `description`, a README, a
 * comment or a script line can name any vendor it likes and yields nothing,
 * because repository text is data to this scan, never an instruction. Pure:
 * takes a path and the file's contents, reads nothing else, never throws for a
 * manifest's own sake (malformed JSON yields no findings).
 */
import type { ScanFinding } from './finding.js';
import {
  type PackageEcosystem,
  type VendorClass,
  isProtocolClient,
  isSkippedPackage,
  matchPackage,
  normalizePackageName,
} from './vendors.js';

export type ManifestOutcome = 'vendor' | 'skip' | 'protocol-client';

/**
 * One dependency the manifest declares. For a `vendor` outcome `value` is the
 * provider's catalog name and `detail.signal` is `package@version`; for `skip`
 * and `protocol-client` `value` is the package name. `kind` is the ecosystem.
 */
export interface ManifestFinding extends ScanFinding {
  outcome: ManifestOutcome;
  detail: {
    signal: string;
    class: VendorClass;
    scope: string;
    package: string;
  };
}

export interface ManifestInput {
  /** Repository-relative POSIX path; the basename picks the parser. */
  path: string;
  contents: string;
}

interface Declared {
  name: string;
  version: string;
  line: number;
  scope: string;
  /** The dependency section's own class: `devDependencies` is build-time. */
  class: VendorClass;
}

const DEV_SCOPES = new Set([
  'devDependencies',
  'require-dev',
  'dev-dependencies',
  'build-dependencies',
]);

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function ecosystemFor(path: string): PackageEcosystem | undefined {
  const name = basename(path);
  if (name === 'package.json') return 'npm';
  if (name === 'pyproject.toml' || /^requirements[\w.-]*\.txt$/.test(name)) return 'pip';
  if (name === 'go.mod') return 'go';
  if (name === 'Gemfile') return 'gem';
  if (name === 'composer.json') return 'composer';
  if (name === 'Cargo.toml') return 'cargo';
  return undefined;
}

/** Runs the right parser for the file and classifies every declared dependency. */
export function matchManifest(input: ManifestInput): ManifestFinding[] {
  const ecosystem = ecosystemFor(input.path);
  if (ecosystem === undefined) return [];
  const declared = PARSERS[ecosystem](input.contents);
  return declared.map((dependency) => classify(ecosystem, input.path, dependency));
}

function classify(
  ecosystem: PackageEcosystem,
  file: string,
  dependency: Declared,
): ManifestFinding {
  const signal =
    dependency.version === '' ? dependency.name : `${dependency.name}@${dependency.version}`;
  const base = {
    kind: ecosystem,
    evidence: { file, line: dependency.line },
    detail: {
      signal,
      class: dependency.class,
      scope: dependency.scope,
      package: dependency.name,
    },
  };
  if (isSkippedPackage(ecosystem, dependency.name)) {
    return { ...base, outcome: 'skip', value: normalizePackageName(ecosystem, dependency.name) };
  }
  if (isProtocolClient(ecosystem, dependency.name)) {
    return {
      ...base,
      outcome: 'protocol-client',
      value: normalizePackageName(ecosystem, dependency.name),
    };
  }
  const match = matchPackage(ecosystem, dependency.name);
  if (match === undefined) {
    return { ...base, outcome: 'skip', value: normalizePackageName(ecosystem, dependency.name) };
  }
  // A vendor only in a dev section is build-time; a build-time vendor stays so.
  const vendorClass: VendorClass =
    dependency.class === 'build-time' ? 'build-time' : match.entry.class;
  return {
    ...base,
    outcome: 'vendor',
    value: match.entry.catalogName,
    detail: { ...base.detail, class: vendorClass },
  };
}

const PARSERS: Record<PackageEcosystem, (contents: string) => Declared[]> = {
  npm: (contents) => parseJsonSections(contents, ['dependencies', 'devDependencies']),
  composer: (contents) => parseJsonSections(contents, ['require', 'require-dev']),
  pip: parsePip,
  go: parseGoMod,
  gem: parseGemfile,
  cargo: (contents) =>
    parseTomlTables(contents, {
      dependencies: 'dependencies',
      'dev-dependencies': 'dev-dependencies',
      'build-dependencies': 'build-dependencies',
    }),
};

function scopeClass(scope: string): VendorClass {
  return DEV_SCOPES.has(scope) ? 'build-time' : 'runtime';
}

/**
 * JSON manifests (npm, composer). The object is parsed for the names and
 * versions, and the line of each name is found by looking for its quoted key
 * after the section's own key, so evidence lines are real and free text
 * elsewhere in the file cannot contribute a dependency.
 */
function parseJsonSections(contents: string, sections: readonly string[]): Declared[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const lines = contents.split('\n');
  const declared: Declared[] = [];
  for (const scope of sections) {
    const section = (parsed as Record<string, unknown>)[scope];
    if (typeof section !== 'object' || section === null) continue;
    const start = lines.findIndex((line) => line.includes(`"${scope}"`));
    for (const [name, version] of Object.entries(section as Record<string, unknown>)) {
      const line = findLine(lines, (text) => text.includes(`"${name}"`), start);
      declared.push({
        name,
        version: typeof version === 'string' ? version : '',
        line,
        scope,
        class: scopeClass(scope),
      });
    }
  }
  return declared;
}

function findLine(lines: readonly string[], test: (line: string) => boolean, from: number): number {
  for (let index = Math.max(from, 0); index < lines.length; index += 1) {
    if (test(lines[index] ?? '')) return index + 1;
  }
  return 1;
}

const PIP_REQUIREMENT =
  /^([A-Za-z0-9][A-Za-z0-9._-]*(?:\[[^\]]*\])?)\s*((?:[=!~<>]=?|===)\s*[^;#\s]+)?/;

/** `requirements*.txt` or a `pyproject.toml`: one grammar for the requirement itself. */
function parseRequirement(text: string, line: number, scope: string): Declared | undefined {
  // Blank lines, comments and `-r`/`--option` lines fail the grammar on their first character.
  const match = PIP_REQUIREMENT.exec(text.trim());
  if (match === null || match[1] === undefined) return undefined;
  return {
    name: match[1],
    version: (match[2] ?? '').replace(/^==/, '').replaceAll(/\s+/g, ''),
    line,
    scope,
    class: scopeClass(scope),
  };
}

function parsePip(contents: string): Declared[] {
  if (/^\s*\[(project|tool\.poetry)/m.test(contents)) return parsePyproject(contents);
  const declared: Declared[] = [];
  contents.split('\n').forEach((text, index) => {
    const dependency = parseRequirement(text, index + 1, 'requirements');
    if (dependency !== undefined) declared.push(dependency);
  });
  return declared;
}

/**
 * PEP 621 (`[project] dependencies = [...]`, `[project.optional-dependencies]`)
 * and Poetry (`[tool.poetry.dependencies]`, `[tool.poetry.group.*.dependencies]`)
 * read line by line: a TOML parser is not a dependency of this package, and
 * these tables are regular enough for one.
 */
function parsePyproject(contents: string): Declared[] {
  const declared: Declared[] = [];
  let table = '';
  let inArray = false;
  let arrayScope = '';
  contents.split('\n').forEach((raw, index) => {
    const text = raw.trim();
    const line = index + 1;
    const header = /^\[([^\]]+)\]$/.exec(text);
    if (header !== null) {
      table = header[1] ?? '';
      inArray = false;
      return;
    }
    if (inArray) {
      if (text.startsWith(']')) {
        inArray = false;
        return;
      }
      const item = /^"([^"]+)"/.exec(text);
      if (item?.[1] !== undefined) {
        const dependency = parseRequirement(item[1], line, arrayScope);
        if (dependency !== undefined) declared.push(dependency);
      }
      return;
    }
    if (table === 'project' || table.startsWith('project.optional-dependencies')) {
      const start = /^([\w-]+)\s*=\s*\[/.exec(text);
      if (start !== null && (table !== 'project' || start[1] === 'dependencies')) {
        arrayScope = table === 'project' ? 'dependencies' : 'optional-dependencies';
        inArray = !text.includes(']');
        for (const item of text.matchAll(/"([^"]+)"/g)) {
          const dependency = parseRequirement(item[1] ?? '', line, arrayScope);
          if (dependency !== undefined) declared.push(dependency);
        }
      }
      return;
    }
    const poetry = /^tool\.poetry(?:\.group\.([\w-]+))?\.dependencies$/.exec(table);
    if (poetry === null) return;
    const entry = parseTomlAssignment(text);
    if (entry === undefined || entry.name === 'python') return;
    const group = poetry[1];
    const scope =
      group === undefined ? 'dependencies' : group === 'dev' ? 'devDependencies' : group;
    declared.push({ ...entry, line, scope, class: scopeClass(scope) });
  });
  return declared;
}

/** `name = "1.0"` or `name = { version = "1.0", ... }` on one line. */
function parseTomlAssignment(text: string): { name: string; version: string } | undefined {
  const match = /^([A-Za-z0-9._-]+)\s*=\s*(.*)$/.exec(text);
  if (match === null || match[1] === undefined) return undefined;
  const rest = match[2] ?? '';
  const quoted = /^"([^"]*)"/.exec(rest);
  if (quoted !== null) return { name: match[1], version: quoted[1] ?? '' };
  const inline = /version\s*=\s*"([^"]*)"/.exec(rest);
  return { name: match[1], version: inline?.[1] ?? '' };
}

/** Cargo: `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, also target-specific ones. */
function parseTomlTables(contents: string, scopes: Readonly<Record<string, string>>): Declared[] {
  const declared: Declared[] = [];
  let scope: string | undefined;
  contents.split('\n').forEach((raw, index) => {
    const text = raw.trim();
    const header = /^\[([^\]]+)\]$/.exec(text);
    if (header !== null) {
      const table = header[1] ?? '';
      const key = Object.keys(scopes).find((name) => table === name || table.endsWith(`.${name}`));
      scope = key === undefined ? undefined : scopes[key];
      return;
    }
    if (scope === undefined || text === '' || text.startsWith('#')) return;
    const entry = parseTomlAssignment(text);
    if (entry === undefined) return;
    declared.push({ ...entry, line: index + 1, scope, class: scopeClass(scope) });
  });
  return declared;
}

/** `go.mod`: every `require` line, single or block form; the module line is not a dependency. */
function parseGoMod(contents: string): Declared[] {
  const declared: Declared[] = [];
  let inBlock = false;
  contents.split('\n').forEach((raw, index) => {
    const text = raw.replace(/\/\/.*$/, '').trim();
    if (text === 'require (') {
      inBlock = true;
      return;
    }
    if (inBlock && text === ')') {
      inBlock = false;
      return;
    }
    const single = /^require\s+(\S+)\s+(\S+)/.exec(text);
    const inner = inBlock ? /^(\S+)\s+(\S+)/.exec(text) : null;
    const match = single ?? inner;
    if (match === null || match[1] === undefined) return;
    declared.push({
      name: match[1],
      version: match[2] ?? '',
      line: index + 1,
      scope: 'require',
      class: 'runtime',
    });
  });
  return declared;
}

/** `gem 'name', 'constraint'`; groups are not tracked, every gem is runtime. */
function parseGemfile(contents: string): Declared[] {
  const declared: Declared[] = [];
  contents.split('\n').forEach((raw, index) => {
    const match = /^\s*gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/.exec(raw);
    if (match === null || match[1] === undefined) return;
    declared.push({
      name: match[1],
      version: match[2] ?? '',
      line: index + 1,
      scope: 'gem',
      class: 'runtime',
    });
  });
  return declared;
}
