import { describe, expect, it } from 'vitest';
import { operations } from '../src/generated/operations.js';
import { synthesizedRequestExample } from '../src/lib/request-example.js';
import { buildRequestBody } from '../src/lib/request.js';

describe('synthesized request examples', () => {
  it('builds a locally valid example from required fields', async () => {
    const operation = operations['maintenance-windows:create'];
    const example = synthesizedRequestExample(operation);
    const body = await buildRequestBody(
      operation,
      { body: JSON.stringify(example) },
      new Headers(),
    );

    expect(JSON.parse(String(body))).toEqual({
      date: '2024-06-20',
      duration: 30,
      interval: 'once',
      name: 'Friday Maintenance window',
      time: '14:30:00',
    });
  });

  it('chooses one non-sensitive example for a body with only optional fields', async () => {
    const operation = operations['monitors:update'];
    const example = synthesizedRequestExample(operation);
    const body = await buildRequestBody(
      operation,
      { body: JSON.stringify(example) },
      new Headers(),
    );

    expect(JSON.parse(String(body))).toEqual({ friendlyName: 'My monitor' });
  });
});
