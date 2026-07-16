import { describe, expect, it } from 'vitest';
import { normalizeApiError } from '../src/api/errors.js';

describe('API errors', () => {
  it('uses a raw API error body as the message', () => {
    expect(normalizeApiError(401, 'Token is required')).toEqual({
      code: 'HTTP_401',
      message: 'Token is required',
      status: 401,
    });
  });
});
