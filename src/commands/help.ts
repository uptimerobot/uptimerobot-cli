import { Args } from '@oclif/core';
import { loadHelpClass } from '@oclif/core/help';
import { BaseCommand } from '../lib/base-command.js';

export default class Help extends BaseCommand {
  // A topic is spelled with spaces (`help monitors bulk`), so the subject is
  // variadic. Declaring an argument at all is what stops oclif from folding the
  // words into the command id, which is what made `help monitors` fail as
  // `command help:monitors not found`.
  static override args = {
    command: Args.string({
      description: 'Command or topic to describe; omit for the command overview',
      multiple: true,
      required: false,
    }),
  };

  static override description =
    'With no argument, print the command overview, identical to running uptimerobot --help';
  static override summary = 'Display help for uptimerobot';

  async run(): Promise<void> {
    const { args } = await this.parse(Help);
    // Loaded the way --help loads it, so both paths honour a custom help class
    // and render the same output.
    const HelpClass = await loadHelpClass(this.config);
    const help = new HelpClass(this.config, this.config.pjson.oclif.helpOptions);
    await help.showHelp(args.command ?? []);
  }
}
