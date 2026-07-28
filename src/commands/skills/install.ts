import { BaseCommand } from '../../lib/base-command.js';
import {
  confirmationAvailable,
  detectInvocationMode,
  requestConfirmation,
} from '../../lib/invocation.js';
import { runSkillsInstaller, SKILLS_INSTALL_COMMAND } from '../../lib/skills-installer.js';

export default class SkillsInstall extends BaseCommand {
  static override description = `Run the external skills installer for the UptimeRobot AI skill collection. After confirmation, ${SKILLS_INSTALL_COMMAND} controls the terminal and prompts for skills, agents, and installation scope.`;
  static override summary = 'Install UptimeRobot AI skills';

  async run(): Promise<void> {
    await this.parse(SkillsInstall);
    const mode = detectInvocationMode(false);
    if (!confirmationAvailable(mode)) {
      return this.fail(
        {
          code: 'CONFIRMATION_REQUIRED',
          message: `Interactive confirmation is required. Run ${SKILLS_INSTALL_COMMAND} directly in a terminal.`,
        },
        2,
      );
    }

    const confirmed = await requestConfirmation(`Run ${SKILLS_INSTALL_COMMAND}`, mode);
    if (!confirmed) {
      this.logToStderr('Installation cancelled.');
      return;
    }

    try {
      const exitCode = await runSkillsInstaller();
      if (exitCode !== 0) process.exitCode = exitCode;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return this.fail(
          {
            code: 'INSTALLER_NOT_FOUND',
            message: 'Could not start npx. Install npm and ensure npx is available on PATH.',
          },
          1,
        );
      }
      throw error;
    }
  }
}
