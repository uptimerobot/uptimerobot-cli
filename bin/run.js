#!/usr/bin/env node

import { flush, handle, run } from '@oclif/core';
import { commandSuggestion } from '../dist/lib/command-suggestions.js';
import {
  errorEnvelope,
  exitCodeForError,
  machineOutputRequested,
  wasErrorHandled,
} from '../dist/lib/cli-errors.js';

try {
  await run(process.argv.slice(2), import.meta.url);
  await flush();
} catch (error) {
  await flush();
  const suggestion = commandSuggestion(process.argv.slice(2));
  if (
    suggestion &&
    typeof error === 'object' &&
    error !== null &&
    /^command .+ not found$/.test(error.message ?? '')
  ) {
    error.suggestions = [`uptimerobot ${suggestion}`];
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
