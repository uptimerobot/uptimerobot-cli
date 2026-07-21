import { flagName } from './flag-name.js';
import type { OperationDefinition } from './types.js';

export function enrichOperationParserError(error: Error, operation: OperationDefinition): void {
  const enumFailure = /^Expected --([^=]+)=.* to be one of: ([^\n]+)/.exec(error.message);
  if (enumFailure) {
    const [, flag, options] = enumFailure;
    const path = pathForFlag(operation, flag!);
    if (path) Object.assign(error, { expected: `one of: ${options}`, path });
    return;
  }

  const missingArgument = /^Missing 1 required arg:\n([^\n]+)/.exec(error.message);
  if (missingArgument?.[1]) {
    Object.assign(error, { expected: 'a value', path: missingArgument[1] });
    return;
  }

  const missingFlag = /Missing required flag ([^\s\n]+)/.exec(error.message);
  if (missingFlag?.[1]) {
    const path = pathForFlag(operation, missingFlag[1]);
    if (path) Object.assign(error, { expected: 'a value', path });
  }
}

function pathForFlag(operation: OperationDefinition, flag: string): string | undefined {
  const bodyField = operation.requestBodyFields?.find(
    (field) => field.flag === flag || field.aliases?.includes(flag),
  );
  if (bodyField) return bodyField.path;
  return operation.parameters.find(
    (parameter) => parameter.in === 'query' && flagName(parameter.name) === flag,
  )?.name;
}
