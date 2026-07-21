import { describe, expect, it } from 'vitest';
import { operations } from '../src/generated/operations.js';
import { curatedRequestBodyFields, curatedRequestExamples } from '../src/lib/request-curation.js';

describe('CLI request curation', () => {
  it('keeps Keyword method fields and examples aligned with the CLI safety default', () => {
    const operation = operations['monitors:create:keyword'];
    const method = curatedRequestBodyFields(operation).find(
      (field) => field.path === 'httpMethodType',
    );

    expect(method).toMatchObject({
      default: 'GET',
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'QUERY'],
      example: 'GET',
    });
    expect(curatedRequestExamples(operation)[0]?.body).toMatchObject({ httpMethodType: 'GET' });
  });

  it('contains the temporary API assertion-target compatibility rule at its real schema path', () => {
    const operation = operations['monitors:create:api'];
    const checks = curatedRequestBodyFields(operation).find(
      (field) => field.path === 'config.apiAssertions.checks',
    );

    expect(checks?.items?.properties?.target).toMatchObject({ type: 'json' });
  });
});
