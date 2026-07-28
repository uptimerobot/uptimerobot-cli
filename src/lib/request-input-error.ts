/**
 * Raised while compiling a request body, before anything is sent. Carries the
 * offending field path so the CLI can report it as a machine-readable error.
 */
export class RequestInputError extends Error {
  readonly code = 'INVALID_INPUT';
  readonly exitCode = 2;

  constructor(
    readonly path: string,
    readonly expected: string,
    message = `Invalid ${path}: expected ${expected}.`,
  ) {
    super(message);
    this.name = 'RequestInputError';
  }
}
