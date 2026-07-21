import { describe, expect, it } from 'vitest';
import { redactRequestPreview } from '../src/lib/request-preview.js';

describe('request previews', () => {
  it('redacts known credential fields and reports their paths', () => {
    expect(
      redactRequestPreview({
        customHttpHeaders: {
          Authorization: 'Bearer secret',
          'X-Trace-Id': 'trace-42',
        },
        httpPassword: 'supersecret',
        nested: [{ pushToken: 'device-secret', value: 'visible' }],
      }),
    ).toEqual({
      body: {
        customHttpHeaders: {
          Authorization: '[REDACTED]',
          'X-Trace-Id': 'trace-42',
        },
        httpPassword: '[REDACTED]',
        nested: [{ pushToken: '[REDACTED]', value: 'visible' }],
      },
      redacted: ['customHttpHeaders.Authorization', 'httpPassword', 'nested[0].pushToken'],
    });
  });

  it('preserves bodies without recognizable credential fields', () => {
    expect(redactRequestPreview({ friendlyName: 'checkout', keywordValue: 'ok' })).toEqual({
      body: { friendlyName: 'checkout', keywordValue: 'ok' },
      redacted: [],
    });
  });
});
