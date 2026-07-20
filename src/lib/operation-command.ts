import { Args, Command, Flags } from '@oclif/core';
import { createApiClient } from '../api/client.js';
import { exitCodeFor, normalizeApiError } from '../api/errors.js';
import { columnsFor, parseColumnsFlag } from '../output/columns.js';
import { normalizeResult } from '../output/normalize-result.js';
import { formatOutput } from '../output/renderer.js';
import { withRequestProgress } from '../output/request-progress.js';
import { resolveFormat } from '../output/resolve-format.js';
import { parseInput } from '../runtime/parse-input.js';
import { InputValidationError, validateInput } from '../runtime/validate-input.js';
import { AuthenticationError, resolveApiKey } from './auth.js';
import { detectInvocationMode, isCI, requestConfirmation } from './invocation.js';
import { buildRequestBody, buildUrl } from './request.js';
import type { CliError, FlagValues, OperationDefinition } from './types.js';

export function createOperationCommand(operation: OperationDefinition): typeof Command {
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
    json: Flags.boolean({ description: 'Emit structured JSON output' }),
    format: Flags.string({
      description: 'Output format',
      options: ['json', 'jsonl', 'table', 'plain'],
    }),
    raw: Flags.boolean({ description: 'Emit the original API response as JSON' }),
    ...requestBodyFlags,
    ...Object.fromEntries(
      optionParameters.map((parameter) => {
        const options = {
          description: parameter.description,
          helpValue: `<${parameter.type}>`,
          required: parameter.required,
        };
        return [
          flagName(parameter.name),
          parameter.type === 'array'
            ? Flags.string({ ...options, multiple: true })
            : Flags.string(options),
        ];
      }),
    ),
  };

  class OperationCommand extends Command {
    static override args = commandArgs;
    static override description = operation.description ?? operation.summary;
    static override examples = [`<%= config.bin %> ${operation.commandId.replaceAll(':', ' ')}`];
    static override flags = commandFlags;
    static override summary = operation.summary;

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
          true,
          2,
        );
      }
      if (flags.raw === true && flags.format !== undefined && flags.format !== 'json') {
        return this.fail(
          { code: 'INVALID_INPUT', message: '--raw can only be used with JSON output.' },
          true,
          2,
        );
      }
      if (flags.columns !== undefined && flags.all === true) {
        return this.fail(
          { code: 'INVALID_INPUT', message: '--columns cannot be combined with --all.' },
          jsonOutput,
          2,
        );
      }
      if ((flags.columns !== undefined || flags.all === true) && jsonOutput) {
        return this.fail(
          {
            code: 'INVALID_INPUT',
            message: '--columns and --all only apply to table or plain output.',
          },
          jsonOutput,
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
          jsonOutput,
          2,
        );
      }

      if (operation.destructive && flags.confirm !== true) {
        const confirmed = await requestConfirmation(operation, mode);
        if (!confirmed) {
          const error = {
            code: 'CONFIRMATION_REQUIRED',
            command: operation.commandId.replaceAll(':', ' '),
            message: 'Explicit confirmation is required. Re-run with --confirm.',
          };
          if (jsonOutput) this.logToStderr(JSON.stringify({ error }));
          else this.logToStderr(error.message);
          this.exit(2);
        }
      }

      try {
        validateInput(operation, parseInput(operation, parsed.args, flags));
      } catch (error) {
        if (error instanceof InputValidationError) {
          return this.fail({ code: 'INVALID_INPUT', message: error.message }, jsonOutput, 2);
        }
        throw error;
      }

      let apiKey: string;
      try {
        apiKey = await resolveApiKey(flags['api-key'], apiUrl.toString());
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return this.fail(
            { code: error.code, message: error.message },
            jsonOutput,
            error.exitCode,
          );
        }
        throw error;
      }

      const url = buildUrl(operation, parsed.args, flags, apiUrl);
      const headers = new Headers({ accept: 'application/json' });
      const client = createApiClient({
        apiKey,
        apiUrl,
        environment: ci ? 'ci' : 'local',
        mode,
        version: this.config.pjson.version,
      });

      let body: BodyInit | undefined;
      try {
        body = await buildRequestBody(operation, flags, headers);
      } catch (error) {
        return this.fail(
          {
            code: 'INVALID_INPUT',
            message: error instanceof Error ? error.message : String(error),
          },
          jsonOutput,
          2,
        );
      }

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
          jsonOutput,
          1,
        );
      }

      const { payload, response } = result;
      if (!response.ok) {
        const apiError = normalizeApiError(response.status, payload);
        return this.fail(apiError, jsonOutput, exitCodeFor(response.status));
      }

      const output = formatOutput(
        outputFormat,
        flags.raw === true ? payload : normalizeResult(payload),
        {
          allColumns: flags.all === true,
          columns: requestedColumns ?? (flags.all === true ? undefined : defaultColumns),
        },
      );
      if (output !== undefined) this.log(output);
    }

    private fail(error: CliError, json: boolean, exit: number): never {
      if (json) this.logToStderr(JSON.stringify({ error }));
      else this.logToStderr(`${error.message}${error.code ? ` (${error.code})` : ''}`);
      return this.exit(exit);
    }
  }

  return OperationCommand as typeof Command;
}

function flagName(value: string): string {
  return value
    .replace(/_/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}
