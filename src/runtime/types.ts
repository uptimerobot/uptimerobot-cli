export type InputValue = boolean | number | string | string[] | undefined;

export interface OperationInput {
  body?: unknown;
  path: Record<string, InputValue>;
  query: Record<string, InputValue>;
}
