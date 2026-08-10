import { Flags } from '@oclif/core';
import { BaseCommand } from '../lib/base-command.js';
import { detectInvocationMode } from '../lib/invocation.js';
import { formatOutput } from '../output/renderer.js';
import { resolveFormat } from '../output/resolve-format.js';

interface VersionInfo {
  /** The Node.js runtime executing the CLI, without the `v` prefix. */
  node: string;
  /** The platform and architecture, spelled the way the user agent spells them. */
  platform: string;
  /** The CLI's own package version. */
  version: string;
}

export default class Version extends BaseCommand {
  // The bare --version flag is handled by oclif core before any command runs,
  // so it always prints one human sentence. This command reports the same
  // facts as separate fields, which is what a version assertion in CI needs.
  static override description =
    'Report the CLI version, the platform it runs on, and the Node.js runtime executing it. Unlike the --version flag, this command honours the output flags, so a caller can read the version as a field instead of parsing a sentence.';
  static override examples = ['<%= config.bin %> version --json'];
  static override flags = {
    format: Flags.string({
      description: 'Output format; json is normalized and jsonl emits one resource per line',
      options: ['json', 'jsonl', 'table', 'plain'],
    }),
    json: Flags.boolean({
      description: 'Shorthand for --format json; emit normalized structured JSON',
    }),
  };
  static override summary = 'Show the CLI version';

  async run(): Promise<void> {
    const { flags } = await this.parse(Version);
    if (flags.json === true && flags.format !== undefined) {
      return this.fail(
        { code: 'INVALID_INPUT', message: '--json cannot be combined with --format.' },
        2,
      );
    }

    const info: VersionInfo = {
      version: this.config.version,
      platform: `${this.config.platform}-${this.config.arch}`,
      node: process.versions.node,
    };
    const format = resolveFormat(flags, detectInvocationMode(false));
    if (format === 'json' || format === 'jsonl') {
      this.log(JSON.stringify(info));
      return;
    }
    // A single record has no collection to render, so it is passed as a
    // one-row collection to get the table headings and the tab-separated
    // plain row every other command produces.
    const output = formatOutput(format, [info]);
    if (output !== undefined) this.log(output);
  }
}
