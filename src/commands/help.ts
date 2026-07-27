import { loadHelpClass } from '@oclif/core/help';
import { BaseCommand } from '../lib/base-command.js';

export default class Help extends BaseCommand {
  static override description =
    'Print the command overview, identical to running uptimerobot --help';
  static override summary = 'Display help for uptimerobot';

  async run(): Promise<void> {
    await this.parse(Help);
    // Loaded the way --help loads it, so both paths honour a custom help class
    // and render the same output.
    const HelpClass = await loadHelpClass(this.config);
    const help = new HelpClass(this.config, this.config.pjson.oclif.helpOptions);
    await help.showHelp([]);
  }
}
