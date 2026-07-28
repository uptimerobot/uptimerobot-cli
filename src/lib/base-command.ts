import { Command } from '@oclif/core';
import type { CliError } from './types.js';
import {
  CliFailure,
  errorEnvelope,
  exitCodeForError,
  machineOutputRequested,
  markErrorHandled,
} from './cli-errors.js';
import { isUnknownCommandMessage, withConfiguredCommandId } from './command-id.js';

export abstract class BaseCommand extends Command {
  protected override async catch(error: Error & { exitCode?: number }): Promise<never> {
    // The other boundary that turns an error into output. `help <unknown topic>`
    // raises its unknown-command error inside the command, so it never reaches
    // the rewrite in bin/run.js and would keep oclif's colon-joined id.
    if (isUnknownCommandMessage(error.message)) {
      error.message = withConfiguredCommandId(error.message);
    }

    const failure = error instanceof CliFailure;
    const machineOutput = machineOutputRequested(this.argv);
    if (!failure && !machineOutput) {
      await super.catch(error);
      throw error;
    }

    this.logToStderr(
      failure && !machineOutput
        ? `${error.cliError.message}${error.cliError.code ? ` (${error.cliError.code})` : ''}`
        : JSON.stringify(errorEnvelope(error)),
    );
    process.exitCode = exitCodeForError(error);
    markErrorHandled(error);
    throw error;
  }

  protected fail(error: CliError, exitCode: number): never {
    throw new CliFailure(error, exitCode);
  }
}
