#!/usr/bin/env node

const [major, minor, patch] = process.version.replace(/^v/, '').split('.').map(Number);

const nodeVersionSupported =
  major > 22 || (major === 22 && minor > 12) || (major === 22 && minor === 12 && patch >= 0);

if (!nodeVersionSupported) {
  process.stderr.write(
    `uptimerobot requires Node.js 22.12.0 or newer; you are running ${process.version}.\n` +
      'Install a current release from https://nodejs.org/.\n',
  );
  process.exit(1);
}

/**
 * Resolves when a reader closes stdout before the CLI is done writing to it,
 * which is what `| head`, `| head -c`, and `| grep -q` do. Every later write
 * then fails with EPIPE. Without this listener Node reports the stream error
 * as unhandled; with it, the broken pipe is simply the end of the output.
 */
const stdoutClosedEarly = new Promise((resolve) => {
  process.stdout.on('error', (error) => {
    if (error.code === 'EPIPE') resolve();
    else throw error;
  });
});

const { flush, handle, run } = await import('@oclif/core');
const { commandSuggestion } = await import('../dist/lib/command-suggestions.js');
const { isUnknownCommandMessage, withConfiguredCommandId } =
  await import('../dist/lib/command-id.js');
const { errorEnvelope, exitCodeForError, machineOutputRequested, wasErrorHandled } =
  await import('../dist/lib/cli-errors.js');

/**
 * oclif's flush() waits for a `drain` that a broken pipe never emits, so on
 * EPIPE it never settles: Node then printed `Detected unsettled top-level
 * await` on stderr and exited 13. Racing the two keeps stderr meaningful and
 * lets the normal exit path decide the status, which is 0 for a reader that
 * stopped listening and unchanged for a command that had already failed.
 */
const flushOutput = () => Promise.race([flush(), stdoutClosedEarly]);

try {
  await run(process.argv.slice(2), import.meta.url);
  await flushOutput();
} catch (error) {
  await flushOutput();
  if (typeof error === 'object' && error !== null && isUnknownCommandMessage(error.message ?? '')) {
    // oclif names the command with its colon-joined internal id; report it the
    // way the CLI accepts it, so the message is a syntax the user can retype.
    error.message = withConfiguredCommandId(error.message);
    const suggestion = commandSuggestion(process.argv.slice(2));
    if (suggestion) error.suggestions = [`uptimerobot ${suggestion}`];
  }
  if (wasErrorHandled(error)) {
    process.exitCode = exitCodeForError(error);
  } else if (machineOutputRequested()) {
    process.stderr.write(`${JSON.stringify(errorEnvelope(error))}\n`);
    process.exitCode = exitCodeForError(error);
  } else {
    await handle(error);
  }
}
