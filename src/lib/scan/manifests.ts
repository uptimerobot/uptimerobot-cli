/**
 * Reads dependency manifests and names the third-party providers they point
 * at, with `package@version` and `path:line` evidence for each.
 *
 * Only structured dependency fields count. A `description`, a README, a
 * comment or a script line can name any vendor it likes and yields nothing,
 * because repository text is data to this scan, never an instruction. Pure:
 * takes a path and the file's contents, reads nothing else, never throws for a
 * manifest's own sake (malformed JSON yields no findings).
 *
 * Sections read, and nothing else:
 * - `package.json`: `dependencies`, `peerDependencies`, `optionalDependencies`
 *   (runtime), `devDependencies` (build-time).
 * - `composer.json`: `require` (runtime), `require-dev` (build-time).
 * - `requirements*.txt`: every requirement line.
 * - `pyproject.toml`: `[project] dependencies` and `[tool.poetry.dependencies]`
 *   (runtime, plus Poetry's `main` group); `[project.optional-dependencies]`,
 *   `[dependency-groups]`, `[tool.poetry.dev-dependencies]` and every other
 *   Poetry group (build-time). `[table.name]` subtables count, `[[arrays]]` do not.
 * - `go.mod`: `require` lines, `// indirect` included.
 * - `Gemfile`: `gem` lines; a `group` block or `group:` option is build-time.
 * - `Cargo.toml`: `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`,
 *   their `[target.<cfg>.*]` forms and `[table.name]` subtables.
 * Renames (`package = "real-name"` in Cargo or Poetry) are not resolved; the
 * declared name is what the map sees.
 */
import { isPlainRecord } from '../objects.js';
import type { ScanFinding } from './finding.js';
import { type PackageEcosystem, type VendorClass, classifyPackage } from './vendors.js';

/**
 * `vendor`: a mapped provider. `skip`: a framework or library on the skip list.
 * `protocol-client`: a database or queue client whose server is unknown.
 * `unmapped`: a name the map does not know; the scan does not search it.
 */
export type ManifestOutcome = 'vendor' | 'skip' | 'protocol-client' | 'unmapped';

/**
 * One dependency the manifest declares. For a `vendor` outcome `value` is the
 * provider's catalog name and `detail.signal` is `package@version`; for every
 * other outcome `value` is the normalized package name. `kind` is the ecosystem.
 */
export interface ManifestFinding extends ScanFinding {
  outcome: ManifestOutcome;
  detail: {
    /** `package@version`, or the package alone when the manifest pins nothing. */
    signal: string;
    package: string;
    version: string;
    /** The manifest section the dependency sits in, as the manifest names it. */
    scope: string;
    /** The section's class for non-vendor outcomes; the provider's class for a vendor. */
    class: VendorClass;
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

/** An evidence line of 1 also means "location unknown", as in {@link ScanEvidence}. */
const UNKNOWN_LINE = 1;

const DEV_SCOPES = new Set([
  'devDependencies',
  'require-dev',
  'dev-dependencies',
  'build-dependencies',
  'project.optional-dependencies',
  'dependency-groups',
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
  const declared = PARSERS[ecosystem](input.contents, basename(input.path));
  return declared.map((dependency) => classify(ecosystem, input.path, dependency));
}

function classify(
  ecosystem: PackageEcosystem,
  file: string,
  dependency: Declared,
): ManifestFinding {
  const signal =
    dependency.version === '' ? dependency.name : `${dependency.name}@${dependency.version}`;
  const classified = classifyPackage(ecosystem, dependency.name);
  const base = {
    kind: ecosystem,
    evidence: { file, line: dependency.line },
    detail: {
      signal,
      package: dependency.name,
      version: dependency.version,
      scope: dependency.scope,
      class: dependency.class,
    },
  };
  if (classified.outcome !== 'vendor') {
    return { ...base, outcome: classified.outcome, value: classified.name };
  }
  // A vendor only in a dev section is build-time; a build-time vendor stays so.
  const vendorClass: VendorClass =
    dependency.class === 'build-time' ? 'build-time' : classified.match.entry.class;
  return {
    ...base,
    outcome: 'vendor',
    value: classified.match.entry.catalogName,
    detail: { ...base.detail, class: vendorClass },
  };
}

const PARSERS: Record<PackageEcosystem, (contents: string, name: string) => Declared[]> = {
  npm: (contents) =>
    parseJsonSections(contents, [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
      'devDependencies',
    ]),
  composer: (contents) => parseJsonSections(contents, ['require', 'require-dev']),
  pip: (contents, name) =>
    name === 'pyproject.toml' ? parsePyproject(contents) : parseRequirements(contents),
  go: parseGoMod,
  gem: parseGemfile,
  cargo: parseCargo,
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
  if (!isPlainRecord(parsed)) return [];
  const lines = contents.split('\n');
  const declared: Declared[] = [];
  for (const scope of sections) {
    const section = parsed[scope];
    if (!isPlainRecord(section)) continue;
    const start = lines.findIndex((line) => line.includes(`"${scope}"`));
    for (const [name, version] of Object.entries(section)) {
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

/**
 * The first line at or after `from` that passes the test; {@link UNKNOWN_LINE}
 * when the section key itself was not found (`from` is -1) or nothing matches,
 * as happens in a minified manifest where every finding sits on line 1 anyway.
 */
function findLine(lines: readonly string[], test: (line: string) => boolean, from: number): number {
  if (from < 0) return UNKNOWN_LINE;
  const index = lines.findIndex((text, position) => position >= from && test(text));
  return index < 0 ? UNKNOWN_LINE : index + 1;
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

function parseRequirements(contents: string): Declared[] {
  const declared: Declared[] = [];
  contents.split('\n').forEach((text, index) => {
    const dependency = parseRequirement(text, index + 1, 'requirements');
    if (dependency !== undefined) declared.push(dependency);
  });
  return declared;
}

/** One `key = value` pair from a TOML file, with the table it sits in. */
interface TomlAssignment {
  table: string;
  key: string;
  /** The value's lines, so array items keep their own line numbers. */
  value: readonly { text: string; line: number }[];
  line: number;
}

/**
 * `text` up to its first `#` outside quoted strings (`keepStrings`), or only
 * the characters outside quoted strings with the comment removed (the default,
 * for bracket counting).
 */
function tomlCode(text: string, options: { keepStrings?: boolean } = {}): string {
  let out = '';
  let quote: string | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (quote !== undefined) {
      if (options.keepStrings === true) out += char;
      if (char === '\\' && quote === '"') {
        if (options.keepStrings === true) out += text[index + 1] ?? '';
        index += 1;
      } else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '#') break;
    if (char !== '#') out += char;
  }
  return out;
}

const TOML_HEADER = /^\[\[?\s*([^\]]+?)\s*\]\]?\s*$/;
/** A bare or quoted key; a dotted key (`serde.version = "1"`) is `key` plus `subkey`. */
const TOML_KEY = /^("[^"]*"|'[^']*'|[A-Za-z0-9_-]+)(?:\.([A-Za-z0-9_.-]+))?\s*=\s*(.*)$/;

/**
 * A line-level TOML reader: enough for dependency tables, no more. Tracks the
 * current table (`[x]` and `[[x]]`, trailing comments allowed), and joins the
 * lines of an array or inline table opened on a key's line until its brackets
 * balance outside quotes. A TOML parser is not a dependency of this package.
 */
function readToml(contents: string): TomlAssignment[] {
  const assignments: TomlAssignment[] = [];
  let table = '';
  let open: { assignment: TomlAssignment; depth: number } | undefined;
  contents.split('\n').forEach((raw, index) => {
    const line = index + 1;
    const code = tomlCode(raw);
    if (open !== undefined) {
      // Comments inside an array never reach the value: `# "stripe",` is not a dependency.
      open.assignment.value = [
        ...open.assignment.value,
        { text: tomlCode(raw, { keepStrings: true }), line },
      ];
      open.depth += depthDelta(code);
      if (open.depth <= 0) open = undefined;
      return;
    }
    // Headers keep their quoted segments (`[target.'cfg(unix)'.dependencies]`).
    const header = TOML_HEADER.exec(raw.trim().replace(/\s+#.*$/, ''));
    if (header !== null) {
      table = header[1] ?? '';
      return;
    }
    const match = TOML_KEY.exec(raw.trim());
    if (match === null || match[1] === undefined) return;
    const key = match[1].replaceAll(/^["']|["']$/g, '');
    const value = tomlCode(match[3] ?? '', { keepStrings: true });
    const assignment: TomlAssignment = {
      // `serde.version = "1"` is the subtable `[dependencies.serde]` on one line.
      table: match[2] === undefined ? table : `${table}.${key}`,
      key: match[2] === undefined ? key : match[2].slice(match[2].lastIndexOf('.') + 1),
      value: [{ text: value, line }],
      line,
    };
    assignments.push(assignment);
    const depth = depthDelta(tomlCode(value));
    if (depth > 0) open = { assignment, depth };
  });
  return assignments;
}

function depthDelta(code: string): number {
  let depth = 0;
  for (const char of code) {
    if (char === '[' || char === '{') depth += 1;
    else if (char === ']' || char === '}') depth -= 1;
  }
  return depth;
}

/** Every quoted string in the value, with the line it sits on. */
function quotedItems(assignment: TomlAssignment): { text: string; line: number }[] {
  const items: { text: string; line: number }[] = [];
  for (const { text, line } of assignment.value) {
    for (const found of text.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)) {
      items.push({ text: found[1] ?? found[2] ?? '', line });
    }
  }
  return items;
}

/** `"1.0"` or `{ version = "1.0", ... }` on the key's line; '' when neither. */
function versionOf(assignment: TomlAssignment): string {
  const text = assignment.value.map((part) => part.text).join(' ');
  const quoted = /^\s*"([^"]*)"/.exec(text);
  if (quoted !== null) return quoted[1] ?? '';
  return /version\s*=\s*"([^"]*)"/.exec(text)?.[1] ?? '';
}

/**
 * PEP 621 (`[project] dependencies`, `[project.optional-dependencies]`), PEP 735
 * (`[dependency-groups]`) and Poetry (`[tool.poetry.dependencies]`,
 * `dev-dependencies`, `group.<name>.dependencies`, and the `[table.<name>]`
 * subtable form). Only the main dependencies are runtime; every optional, dev
 * or group table is build-time, except Poetry's `main` group.
 */
function parsePyproject(contents: string): Declared[] {
  const declared: Declared[] = [];
  const push = (dependency: Declared | undefined) => {
    if (dependency !== undefined && dependency.name !== 'python') declared.push(dependency);
  };
  for (const assignment of readToml(contents)) {
    const { table, key } = assignment;
    if (table === 'project' && key === 'dependencies') {
      for (const item of quotedItems(assignment))
        push(parseRequirement(item.text, item.line, 'dependencies'));
    } else if (table === 'project.optional-dependencies' || table === 'dependency-groups') {
      for (const item of quotedItems(assignment))
        push(parseRequirement(item.text, item.line, table));
    } else {
      const poetry = POETRY_TABLE.exec(table);
      const dependency = poetry === null ? undefined : tableDependency(assignment, poetry);
      if (poetry === null || dependency === undefined) continue;
      const scope = poetry.groups?.scope ?? '';
      const cls: VendorClass =
        scope === 'dependencies' || poetry.groups?.group === 'main' ? 'runtime' : 'build-time';
      push({ ...dependency, scope, class: cls });
    }
  }
  return declared;
}

/**
 * Cargo: `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, the
 * `[target.<cfg>.<table>]` forms and the `[<table>.<name>]` subtable form.
 */
function parseCargo(contents: string): Declared[] {
  const declared: Declared[] = [];
  for (const assignment of readToml(contents)) {
    const match = CARGO_TABLE.exec(assignment.table);
    const dependency = match === null ? undefined : tableDependency(assignment, match);
    if (match === null || dependency === undefined) continue;
    const scope = match.groups?.scope ?? '';
    declared.push({ ...dependency, scope, class: scopeClass(scope) });
  }
  return declared;
}

const POETRY_TABLE =
  /^tool\.poetry\.(?<scope>dependencies|dev-dependencies|group\.(?<group>[^.]+)\.dependencies)(?:\.(?<subtable>[^.]+))?$/;
const CARGO_TABLE =
  /^(?:target\.[^.]+\.)?(?<scope>dependencies|dev-dependencies|build-dependencies)(?:\.(?<subtable>[^.]+))?$/;

/**
 * The dependency a key in a dependency table names: the key itself in
 * `[table]`, or the subtable's name when the key is `version` in
 * `[table.name]`; any other key of a subtable (`features`, `optional`) is not
 * a dependency.
 */
function tableDependency(
  assignment: TomlAssignment,
  table: RegExpExecArray,
): Pick<Declared, 'name' | 'version' | 'line'> | undefined {
  const subtable = table.groups?.subtable;
  if (subtable !== undefined && assignment.key !== 'version') return undefined;
  return {
    name: subtable ?? assignment.key,
    version: versionOf(assignment),
    line: assignment.line,
  };
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

/**
 * `gem 'name', 'constraint'`. A gem inside a `group ... do` block or carrying
 * a `group:` option is not loaded in production, so it is build-time.
 */
function parseGemfile(contents: string): Declared[] {
  const declared: Declared[] = [];
  let groupDepth = 0;
  contents.split('\n').forEach((raw, index) => {
    const text = raw.trim();
    if (/^group\b.*\bdo$/.test(text)) {
      groupDepth += 1;
      return;
    }
    if (text === 'end' && groupDepth > 0) {
      groupDepth -= 1;
      return;
    }
    const match = /^gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?(.*)$/.exec(text);
    if (match === null || match[1] === undefined) return;
    const grouped = groupDepth > 0 || /\bgroup:/.test(match[3] ?? '');
    declared.push({
      name: match[1],
      version: match[2] ?? '',
      line: index + 1,
      scope: grouped ? 'group' : 'gem',
      class: grouped ? 'build-time' : 'runtime',
    });
  });
  return declared;
}
