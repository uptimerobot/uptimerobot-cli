import { Flags } from '@oclif/core';
import { AuthenticationError, PRODUCTION_API_URL, saveValidatedApiKey } from '../../lib/auth.js';
import { BaseCommand } from '../../lib/base-command.js';
import { credentialsFilePath } from '../../lib/credential-store.js';
import { detectInvocationMode, isCI } from '../../lib/invocation.js';
import { resolveFormat } from '../../output/resolve-format.js';

export default class AuthLogin extends BaseCommand {
  static override description = 'Validate and securely store a UptimeRobot API key';
  static override flags = {
    'api-key': Flags.string({
      description: 'UptimeRobot API key to validate and save',
      env: 'UPTIMEROBOT_API_KEY',
      helpValue: '<key>',
      required: true,
    }),
    json: Flags.boolean({ description: 'Emit structured JSON output' }),
  };
  static override summary = 'Log in with an API key';

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogin);
    const mode = detectInvocationMode(false);
    let backend: Awaited<ReturnType<typeof saveValidatedApiKey>>;
    try {
      backend = await saveValidatedApiKey(flags['api-key'], PRODUCTION_API_URL, {
        environment: isCI() ? 'ci' : 'local',
        mode,
        version: this.config.pjson.version,
      });
    } catch (error) {
      if (error instanceof AuthenticationError)
        this.error(error.message, { code: error.code, exit: error.exitCode });
      throw error;
    }
    const format = resolveFormat(flags, mode);
    if (format === 'json' || format === 'jsonl') {
      this.log(
        JSON.stringify({ authenticated: true, storage: backend, stored: true, type: 'api-key' }),
      );
    } else if (backend === 'keyring') {
      this.log('API key validated and saved in the OS credential store.');
    } else {
      this.log(`API key validated and saved in plaintext at ${credentialsFilePath()}.`);
    }
    if (backend === 'file') {
      this.warn(
        'The OS credential store was unavailable, so the API key was saved in plaintext ' +
          '(file permissions 0600). Use UPTIMEROBOT_API_KEY to avoid storing it.',
      );
    }
  }
}
