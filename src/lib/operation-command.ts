import { Args, Command, Flags } from '@oclif/core';
import { createApiClient } from '../api/client.js';
import { exitCodeFor, normalizeApiError } from '../api/errors.js';
import { bulkFailure, bulkFailureError, bulkFailureExitCode } from '../output/bulk-failure.js';
import { columnsFor, parseColumnsFlag } from '../output/columns.js';
import { normalizeResult } from '../output/normalize-result.js';
import { paginationNotice } from '../output/pagination-notice.js';
import { formatOutput } from '../output/renderer.js';
import { withRequestProgress } from '../output/request-progress.js';
import { resolveFormat } from '../output/resolve-format.js';
import { parseInput } from '../runtime/parse-input.js';
import type { OperationInput } from '../runtime/types.js';
import { InputValidationError, validateInput } from '../runtime/validate-input.js';
import { AuthenticationError, resolveApiKey } from './auth.js';
import { BaseCommand } from './base-command.js';
import { flagName } from './flag-name.js';
import { detectInvocationMode, isCI, requestConfirmation } from './invocation.js';
import { enrichOperationParserError } from './operation-parser-error.js';
import { redactSecrets } from './redact-secrets.js';
import { curatedRequestBodyField, curatedRequestExampleBody } from './request-curation.js';
import { synthesizedRequestExample } from './request-example.js';
import { buildRequestBody, buildUrl, RequestInputError } from './request.js';
import { redactRequestPreview } from './request-preview.js';
import type {
  FlagValues,
  OperationBodyField,
  OperationDefinition,
  OperationValueSchema,
} from './types.js';

export interface OperationCommandOptions {
  canonicalCommand?: string;
}

export function createOperationCommand(
  operation: OperationDefinition,
  options: OperationCommandOptions = {},
): typeof Command {
  const pathParameters = operation.parameters.filter((parameter) => parameter.in === 'path');
  const optionParameters = operation.parameters.filter((parameter) => parameter.in !== 'path');
  const commandArgs = Object.fromEntries(
    pathParameters.map((parameter) => [
      parameter.name,
      Args.string({ description: parameter.description, required: parameter.required }),
    ]),
  );
  const requestBodyFlags =
    operation.contentTypes.length > 0
      ? {
          body: Flags.string({
            description: 'JSON request body, @file, or - for stdin',
            helpValue: '<json|@file|->',
          }),
          ...(operation.contentTypes.includes('application/json')
            ? {
                'dry-run': Flags.boolean({
                  description:
                    'Compile and validate the request as JSON without authentication or networking',
                }),
              }
            : {}),
          ...(operation.contentTypes.includes('multipart/form-data')
            ? {
                file: Flags.string({
                  description: 'Multipart file as field=path (repeatable)',
                  helpValue: '<field=path>',
                  multiple: true,
                }),
              }
            : {}),
          set: Flags.string({
            description: 'Set a request-body field as path=value (repeatable)',
            helpValue: '<path=value>',
            multiple: true,
          }),
        }
      : {};
  const defaultColumns = columnsFor(operation.commandId);
  const bodyFieldFlags = Object.fromEntries(
    (operation.requestBodyFields ?? []).map((field) => [
      field.flag,
      flagForBodyField(curatedRequestBodyField(operation, field)),
    ]),
  );
  const commandFlags = {
    'api-key': Flags.string({
      description: 'UptimeRobot API key',
      env: 'UPTIMEROBOT_API_KEY',
      helpValue: '<key>',
    }),
    agent: Flags.boolean({ description: 'Mark this invocation as agent-driven' }),
    ...(defaultColumns === undefined
      ? {}
      : {
          all: Flags.boolean({
            description:
              'Show every API field in table or plain output; may expose sensitive API fields',
          }),
          columns: Flags.string({
            description: 'Comma-separated columns for table or plain output (dot paths allowed)',
            helpValue: '<a,b.c>',
          }),
        }),
    ...(operation.destructive
      ? { confirm: Flags.boolean({ description: 'Explicitly confirm a destructive action' }) }
      : {}),
    json: Flags.boolean({
      description: 'Shorthand for --format json; emit normalized structured JSON',
    }),
    format: Flags.string({
      description: 'Output format; json is normalized and jsonl emits one resource per line',
      options: ['json', 'jsonl', 'table', 'plain'],
    }),
    raw: Flags.boolean({
      description: 'Emit the untouched API response as JSON; implies --format json',
    }),
    'reveal-secrets': Flags.boolean({
      description: 'Show credential-like response fields instead of redacting them',
    }),
    ...requestBodyFlags,
    ...bodyFieldFlags,
    ...Object.fromEntries(
      optionParameters.map((parameter) => [flagName(parameter.name), flagForParameter(parameter)]),
    ),
  };

  class OperationCommand extends BaseCommand {
    static override args = commandArgs;
    static override description = options.canonicalCommand
      ? `${operation.description ?? operation.summary}

Canonical command: ${options.canonicalCommand}`
      : (operation.description ?? operation.summary);
    static override examples = examplesFor(operation);
    static override flags = commandFlags;
    static override summary = operation.summary;

    protected override async catch(error: Error & { exitCode?: number }): Promise<never> {
      enrichOperationParserError(error, operation);
      return super.catch(error);
    }

    async run(): Promise<void> {
      const parsed = await this.parse(OperationCommand);
      const flags = parsed.flags as FlagValues;
      const apiUrl = new URL(process.env.UPTIMEROBOT_DEV_API_URL ?? operation.defaultApiUrl);
      const mode = detectInvocationMode(flags.agent === true);
      const ci = isCI();
      const outputFormat = resolveFormat(flags, mode);
      const jsonOutput = outputFormat === 'json' || outputFormat === 'jsonl';
      if (flags.json === true && flags.format !== undefined) {
        return this.fail(
          { code: 'INVALID_INPUT', message: '--json cannot be combined with --format.' },
          2,
        );
      }
      if (flags.raw === true && flags.format !== undefined && flags.format !== 'json') {
        return this.fail(
          { code: 'INVALID_INPUT', message: '--raw can only be used with JSON output.' },
          2,
        );
      }
      if (
        flags['dry-run'] === true &&
        ((flags.format !== undefined && flags.format !== 'json') || flags.raw === true)
      ) {
        return this.fail(
          {
            code: 'INVALID_INPUT',
            message: '--dry-run emits a JSON request preview and cannot use this output option.',
          },
          2,
        );
      }
      if (flags.columns !== undefined && flags.all === true) {
        return this.fail(
          { code: 'INVALID_INPUT', message: '--columns cannot be combined with --all.' },
          2,
        );
      }
      if ((flags.columns !== undefined || flags.all === true) && jsonOutput) {
        return this.fail(
          {
            code: 'INVALID_INPUT',
            message: '--columns and --all only apply to table or plain output.',
          },
          2,
        );
      }

      let requestedColumns: ReturnType<typeof parseColumnsFlag> | undefined;
      try {
        requestedColumns =
          typeof flags.columns === 'string' ? parseColumnsFlag(flags.columns) : undefined;
      } catch (error) {
        return this.fail(
          {
            code: 'INVALID_INPUT',
            message: error instanceof Error ? error.message : String(error),
          },
          2,
        );
      }

      let input: OperationInput;
      try {
        input = validateInput(operation, parseInput(operation, parsed.args, flags));
      } catch (error) {
        if (error instanceof InputValidationError) {
          return this.fail(
            {
              code: 'INVALID_INPUT',
              expected: error.expected,
              message: error.message,
              path: error.path,
            },
            2,
          );
        }
        throw error;
      }

      const headers = new Headers({ accept: 'application/json' });
      let body: BodyInit | undefined;
      try {
        body = await buildRequestBody(operation, flags, headers);
      } catch (error) {
        if (error instanceof RequestInputError) {
          return this.fail(
            {
              code: error.code,
              expected: error.expected,
              message: error.message,
              path: error.path,
            },
            error.exitCode,
          );
        }
        return this.fail(
          {
            code: 'INVALID_INPUT',
            message: error instanceof Error ? error.message : String(error),
          },
          2,
        );
      }

      if (flags['dry-run'] === true) {
        if (typeof body !== 'string') {
          return this.fail(
            { code: 'INVALID_INPUT', message: '--dry-run only supports JSON request bodies.' },
            2,
          );
        }
        const url = buildUrl(operation, input, apiUrl);
        const preview = redactRequestPreview(JSON.parse(body));
        this.log(
          JSON.stringify(
            {
              body: preview.body,
              command: operation.commandId.replaceAll(':', ' '),
              contentType: headers.get('content-type'),
              dryRun: true,
              method: operation.method,
              path: `${url.pathname}${url.search}`,
              ...(preview.redacted.length > 0 ? { redacted: preview.redacted } : {}),
            },
            null,
            2,
          ),
        );
        return;
      }

      if (operation.destructive && flags.confirm !== true) {
        const confirmed = await requestConfirmation(operation.summary, mode);
        if (!confirmed) {
          const error = {
            code: 'CONFIRMATION_REQUIRED',
            command: operation.commandId.replaceAll(':', ' '),
            message: 'Explicit confirmation is required. Re-run with --confirm.',
          };
          return this.fail(error, 2);
        }
      }

      let apiKey: string;
      try {
        apiKey = await resolveApiKey(flags['api-key'], apiUrl.toString());
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return this.fail({ code: error.code, message: error.message }, error.exitCode);
        }
        throw error;
      }

      const url = buildUrl(operation, input, apiUrl);
      const client = createApiClient({
        apiKey,
        apiUrl,
        environment: ci ? 'ci' : 'local',
        mode,
        version: this.config.pjson.version,
      });

      let result: Awaited<ReturnType<typeof client.request>>;
      try {
        const showProgress =
          mode === 'human' &&
          (outputFormat === 'plain' || outputFormat === 'table') &&
          process.stdout.isTTY === true &&
          process.stderr.isTTY === true &&
          !ci;
        result = await withRequestProgress(showProgress, () =>
          client.request(url, { body, headers, method: operation.method }),
        );
      } catch (error) {
        return this.fail(
          {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : String(error),
          },
          1,
        );
      }

      const { payload, response } = result;
      if (!response.ok) {
        const apiError = normalizeApiError(response.status, payload);
        return this.fail(apiError, exitCodeFor(response.status));
      }

      const normalized = flags.raw === true ? payload : normalizeResult(payload);
      // Redacted before rendering, so column selection, truncation, and JSONL
      // splitting all operate on the redacted values. --raw stays untouched.
      const redaction =
        flags.raw === true || flags['reveal-secrets'] === true
          ? undefined
          : redactSecrets(normalized);
      const presented = redaction === undefined ? normalized : redaction.value;
      const output = formatOutput(outputFormat, presented, {
        allColumns: flags.all === true,
        columns: requestedColumns ?? (flags.all === true ? undefined : defaultColumns),
      });
      if (output !== undefined) this.log(output);
      // Reported after the results are on stdout, so callers keep the per-item detail.
      const failure = bulkFailure(payload);
      if (failure) return this.fail(bulkFailureError(failure), bulkFailureExitCode(failure));
      const notice = paginationNotice(outputFormat, presented);
      if (notice) this.logToStderr(notice.message);
      if (redaction !== undefined && redaction.redacted.length > 0) {
        this.logToStderr(redactionNotice(redaction.redacted));
      }
    }
  }

  return OperationCommand as typeof Command;
}

const NOTICE_PATH_LIMIT = 3;

function redactionNotice(paths: readonly string[]): string {
  const shown = paths.slice(0, NOTICE_PATH_LIMIT);
  const remainder = paths.length - shown.length;
  const list = remainder > 0 ? `${shown.join(', ')}, and ${remainder} more` : shown.join(', ');
  return `Redacted credential-like response fields: ${list}. Re-run with --reveal-secrets to show them.`;
}

function flagForBodyField(field: OperationBodyField) {
  const options = {
    ...(field.aliases ? { aliases: [...field.aliases] } : {}),
    ...(field.deprecated ? { deprecated: true as const } : {}),
    description: bodyFieldDescription(field),
    ...(field.hidden ? { hidden: true } : {}),
  };
  if (field.type === 'boolean')
    return Flags.boolean({
      ...options,
      allowNo: true,
      ...(typeof field.default === 'boolean' ? { defaultHelp: field.default } : {}),
    });
  if (field.type === 'array') {
    const itemOptions = field.items?.enum?.every(
      (value) => typeof value === 'string' || typeof value === 'number',
    )
      ? { options: field.items.enum.map(String) }
      : {};
    return Flags.string({
      ...options,
      ...itemOptions,
      ...(Array.isArray(field.default)
        ? { defaultHelp: field.default.map((value) => String(value)) }
        : {}),
      helpValue: field.items?.enum?.every(
        (value) => typeof value === 'string' || typeof value === 'number',
      )
        ? '<option>'
        : field.items?.type === 'object' || field.items?.type === 'array'
          ? '<json>'
          : scalarHelpValue(field.items?.type),
      multiple: true,
    });
  }
  if (
    (field.type === 'string' || field.type === 'number' || field.type === 'integer') &&
    field.enum?.every((value) => typeof value === 'string' || typeof value === 'number')
  ) {
    return Flags.string({
      ...options,
      ...(field.default !== undefined ? { defaultHelp: displayValue(field.default) } : {}),
      options: field.enum.map(String),
    });
  }
  return Flags.string({
    ...options,
    ...(field.default !== undefined ? { defaultHelp: displayValue(field.default) } : {}),
    helpValue:
      field.type === 'object' || field.type === 'json'
        ? '<json>'
        : field.type === 'number' || field.type === 'integer'
          ? '<number>'
          : '<value>',
  });
}

function flagForParameter(parameter: OperationDefinition['parameters'][number]) {
  const common = {
    description: parameterDescription(parameter),
    required: parameter.required,
  };
  if (parameter.type === 'boolean') {
    return Flags.boolean({
      ...common,
      allowNo: true,
      ...(typeof parameter.default === 'boolean' ? { defaultHelp: parameter.default } : {}),
    });
  }
  if (parameter.type === 'array') {
    return Flags.string({
      ...common,
      ...(Array.isArray(parameter.default)
        ? { defaultHelp: parameter.default.map((value) => String(value)) }
        : {}),
      helpValue: scalarHelpValue(parameter.itemType),
      multiple: true,
    });
  }
  const hasPrimitiveEnum =
    parameter.enum?.every((value) => typeof value === 'string' || typeof value === 'number') ===
    true;
  return Flags.string({
    ...common,
    ...(hasPrimitiveEnum ? { options: parameter.enum!.map(String) } : {}),
    ...(parameter.default !== undefined ? { defaultHelp: displayValue(parameter.default) } : {}),
    helpValue: hasPrimitiveEnum
      ? '<option>'
      : parameter.type === 'number' || parameter.type === 'integer'
        ? '<number>'
        : '<value>',
  });
}

function bodyFieldDescription(field: OperationBodyField): string {
  const constraints: string[] = [];
  if (field.required) constraints.push('required');
  if (field.minimum !== undefined) constraints.push(`min: ${field.minimum}`);
  if (field.maximum !== undefined) constraints.push(`max: ${field.maximum}`);
  if (field.minLength !== undefined) constraints.push(`min length: ${field.minLength}`);
  if (field.maxLength !== undefined) constraints.push(`max length: ${field.maxLength}`);
  if (field.minItems !== undefined) constraints.push(`min items: ${field.minItems}`);
  if (field.maxItems !== undefined) constraints.push(`max items: ${field.maxItems}`);
  if (field.requiredWhenParentPresent) constraints.push('required when parent object is provided');
  if (field.type === 'boolean') {
    constraints.push(
      typeof field.default === 'boolean'
        ? `not sent when omitted; API default: ${field.default ? 'on' : 'off'}`
        : 'not sent when omitted; API default not documented',
    );
  }
  const suffix = constraints.length > 0 ? ` (${constraints.join(', ')})` : '';
  const itemShape =
    field.type === 'array' && field.items && schemaHasDisplayDetails(field.items)
      ? schemaShape(field.items)
      : undefined;
  const shapeSuffix = itemShape
    ? ` Item shape: ${itemShape}.${field.items?.requiredProperties?.length ? ' An asterisk marks a required property.' : ''}`
    : '';
  const convenience =
    field.path === 'assignedAlertContacts'
      ? ' A bare numeric contact ID is also accepted and uses threshold 0 and recurrence 0.'
      : '';
  return `${field.description ?? `Set ${field.path}`}${suffix}.${shapeSuffix}${convenience}`.replace(
    '..',
    '.',
  );
}

function parameterDescription(parameter: OperationDefinition['parameters'][number]): string {
  const description = parameter.description ?? `Set ${parameter.name}`;
  if (parameter.type !== 'boolean') return description;
  const omission =
    typeof parameter.default === 'boolean'
      ? `not sent when omitted; API default: ${parameter.default ? 'on' : 'off'}`
      : 'not sent when omitted; API default not documented';
  return `${description.replace(/[.]$/, '')} (${omission}).`;
}

function schemaShape(schema: OperationValueSchema): string {
  if (schema.type === 'object' && schema.properties) {
    const required = new Set(schema.requiredProperties ?? []);
    const properties = Object.entries(schema.properties).map(
      ([name, property]) => `${name}${required.has(name) ? '*' : ''}:${schemaShape(property)}`,
    );
    return `{${properties.join(', ')}}${schemaConstraints(schema)}`;
  }
  if (schema.type === 'array') {
    return `array<${schema.items ? schemaShape(schema.items) : 'value'}>${schemaConstraints(schema)}`;
  }
  return `${schema.type}${schemaConstraints(schema)}`;
}

function schemaConstraints(schema: OperationValueSchema): string {
  const constraints: string[] = [];
  if (schema.enum?.length) constraints.push(`one of: ${schema.enum.map(String).join(', ')}`);
  if (schema.minimum !== undefined) constraints.push(`min: ${schema.minimum}`);
  if (schema.maximum !== undefined) constraints.push(`max: ${schema.maximum}`);
  if (schema.minLength !== undefined) constraints.push(`min length: ${schema.minLength}`);
  if (schema.maxLength !== undefined) constraints.push(`max length: ${schema.maxLength}`);
  if (schema.minItems !== undefined) constraints.push(`min items: ${schema.minItems}`);
  if (schema.maxItems !== undefined) constraints.push(`max items: ${schema.maxItems}`);
  if (schema.example !== undefined) constraints.push(`example: ${displayValue(schema.example)}`);
  return constraints.length > 0 ? ` (${constraints.join('; ')})` : '';
}

function schemaHasDisplayDetails(schema: OperationValueSchema): boolean {
  return (
    schema.type === 'object' ||
    schema.type === 'array' ||
    schema.enum !== undefined ||
    schema.minimum !== undefined ||
    schema.maximum !== undefined ||
    schema.minLength !== undefined ||
    schema.maxLength !== undefined ||
    schema.minItems !== undefined ||
    schema.maxItems !== undefined ||
    schema.example !== undefined
  );
}

function examplesFor(operation: OperationDefinition) {
  const command = commandForExample(operation);
  const authoredExamples = operation.requestBodyExamples?.map((example) =>
    curatedRequestExampleBody(operation, example.body),
  );
  const synthesized = authoredExamples?.length ? undefined : synthesizedRequestExample(operation);
  const requestExamples = authoredExamples?.length
    ? authoredExamples
    : synthesized === undefined
      ? []
      : [synthesized];
  if (requestExamples.length > 0) {
    return requestExamples.map(
      (body) => `${command} --body \\\n  ${shellQuote(JSON.stringify(body))}`,
    );
  }
  return operation.contentTypes.length === 0 ? [command] : [];
}

function commandForExample(operation: OperationDefinition): string {
  const parts = [`<%= config.bin %>`, operation.commandId.replaceAll(':', ' ')];
  for (const parameter of operation.parameters.filter((candidate) => candidate.in === 'path')) {
    parts.push(exampleParameterValue(parameter));
  }
  for (const parameter of operation.parameters.filter(
    (candidate) => candidate.in === 'query' && candidate.required,
  )) {
    const flag = `--${flagName(parameter.name)}`;
    if (parameter.type === 'boolean') parts.push(flag);
    else parts.push(flag, exampleParameterValue(parameter));
  }
  return parts.join(' ');
}

function exampleParameterValue(parameter: OperationDefinition['parameters'][number]): string {
  const value =
    parameter.example ??
    parameter.enum?.[0] ??
    (parameter.type === 'number' || parameter.type === 'integer' ? 123 : 'example');
  const rendered = String(value);
  return /\s/.test(rendered) ? shellQuote(rendered) : rendered;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function scalarHelpValue(type: string | undefined): string {
  if (type === 'number' || type === 'integer') return '<number>';
  if (type === 'boolean') return '<boolean>';
  if (type === 'json') return '<json>';
  return '<value>';
}

function displayValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
