import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/lib/scan/redact.js';

describe('redactSecrets', () => {
  it('does not let a valueless flag consume the sensitive flag that follows it', () => {
    expect(redactSecrets('wget -q --password hunter2 http://localhost:3000/health')).toBe(
      'wget -q --password *** http://localhost:3000/health',
    );
  });

  it('still redacts a sensitive flag whose value is quoted or assigned', () => {
    expect(redactSecrets("curl -s --token 'abc' --api-key=def")).toBe(
      'curl -s --token *** --api-key=***',
    );
  });
});
