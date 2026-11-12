import { describe, expect, it } from 'vitest';
import { redactClipped, redactSecrets } from '../src/lib/scan/redact.js';

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

  it('redacts a sensitive value that starts with a dash or spans quoted fragments', () => {
    expect(redactSecrets('wget --password -hunter2 http://localhost:3000/health')).toBe(
      'wget --password *** http://localhost:3000/health',
    );
    expect(redactSecrets(`curl --token 'abc'"d e"f http://h/`)).toBe('curl --token *** http://h/');
  });

  it('redacts a quoted value whose quote is escaped inside it', () => {
    expect(redactSecrets('wget --password "alpha\\"hunter2" http://localhost:3000/health')).toBe(
      'wget --password *** http://localhost:3000/health',
    );
    expect(redactSecrets('wget --password al\\ pha http://h/')).toBe(
      'wget --password *** http://h/',
    );
  });
});

describe('redactClipped', () => {
  it('masks a credential cut in half by the clip instead of leaking its prefix', () => {
    const password = 'p'.repeat(3000);
    const clipped = redactClipped(`curl http://admin:${password}@localhost/health`, 2000);

    expect(clipped).toBe('curl http://***');
    expect(clipped).not.toContain('ppp');
  });

  it('leaves a short value alone and redacts a long one past the clip', () => {
    expect(redactClipped('curl http://user:pw@h/', 2000)).toBe('curl http://***@h/');
    expect(redactClipped(`curl http://h/${'a'.repeat(3000)}`, 2000)).toHaveLength(2000);
  });
});
