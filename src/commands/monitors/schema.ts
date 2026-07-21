import { Args, Flags } from '@oclif/core';
import { operations } from '../../generated/operations.js';
import { BaseCommand } from '../../lib/base-command.js';
import {
  cliRequestDefaults,
  curatedRequestBodyFields,
  curatedRequestExamples,
} from '../../lib/request-curation.js';
import { buildRequestBody } from '../../lib/request.js';
import type { OperationDefinition } from '../../lib/types.js';

const PREFIX = 'monitors:create:';
const monitorCreateOperations = Object.fromEntries(
  Object.entries(operations).filter(([commandId]) => commandId.startsWith(PREFIX)),
) as Record<string, OperationDefinition>;
const monitorTypes = Object.keys(monitorCreateOperations)
  .map((commandId) => commandId.slice(PREFIX.length))
  .sort();

export default class MonitorsSchema extends BaseCommand {
  static override args = {
    type: Args.string({
      description: 'Monitor type',
      options: monitorTypes,
      required: true,
    }),
  };

  static override description =
    'Print the CLI request schema for a monitor type without authentication or networking';
  static override flags = {
    example: Flags.boolean({ description: 'Print one locally validated example body' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(MonitorsSchema);
    const commandId = `${PREFIX}${args.type}`;
    const operation = monitorCreateOperations[commandId];
    if (!operation) {
      return this.fail(
        {
          code: 'INVALID_INPUT',
          expected: monitorTypes.join(', '),
          message: `Unknown monitor type: ${args.type}`,
          path: 'type',
        },
        2,
      );
    }

    if (flags.example) {
      const example = curatedRequestExamples(operation)[0];
      if (!example) {
        return this.fail(
          {
            code: 'EXAMPLE_UNAVAILABLE',
            message: `No authored request example is available for ${commandId.replaceAll(':', ' ')}.`,
          },
          2,
        );
      }
      const body = await buildRequestBody(
        operation,
        { body: JSON.stringify(example.body) },
        new Headers(),
      );
      this.log(String(body));
      return;
    }

    this.log(
      JSON.stringify(
        {
          cliDefaults: cliRequestDefaults(operation),
          command: commandId.replaceAll(':', ' '),
          examples: curatedRequestExamples(operation),
          fields: curatedRequestBodyFields(operation),
          fixedValues: operation.requestBodyDefaults ?? {},
          method: operation.method,
          path: operation.path,
        },
        null,
        2,
      ),
    );
  }
}
