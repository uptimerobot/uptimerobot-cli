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

const TERMINAL_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

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

    // The human line is the one place an API message reaches a terminal raw;
    // the JSON envelope is left as is for the machine reading it. Line breaks
    // stay: the CLI's own messages lay out commands one per line.
    this.logToStderr(
      failure && !machineOutput
        ? `${error.cliError.message.replaceAll(TERMINAL_CONTROL, '')}${error.cliError.code ? ` (${error.cliError.code})` : ''}`
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
