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

describe('redactSecrets, round two', () => {
  it('masks a password up to the last @ and one that holds a slash', () => {
    expect(redactSecrets('psql postgres://admin:p@ss@db:5432/app')).toBe(
      'psql postgres://***@db:5432/app',
    );
    expect(redactSecrets('curl http://admin:p/w@h/x')).toBe('curl http://***@h/x');
  });

  it('masks the values of short credential flags, attached or separated', () => {
    expect(redactSecrets('mysqldump -uroot -phunter2 app')).toBe('mysqldump -u*** -p*** app');
    expect(redactSecrets('tool -p hunter2 run')).toBe('tool -p *** run');
    expect(redactSecrets('curl -u admin:hunter2 http://h/')).toBe('curl -u *** http://h/');
    expect(redactSecrets('curl --user admin:hunter2 http://h/')).toBe('curl --user *** http://h/');
  });

  it('masks a long opaque path segment such as a heartbeat push token', () => {
    expect(redactSecrets('https://heartbeat.example/9f8e7d6c5b4a39281706f5e4d3c2b1a0')).toBe(
      'https://heartbeat.example/***',
    );
    expect(redactSecrets('https://example.com/api/cron/daily-digest-report-v2')).toBe(
      'https://example.com/api/cron/daily-digest-report-v2',
    );
  });

  it('masks a clipped credential whose password holds an @', () => {
    const clipped = redactClipped(`curl http://admin:p@${'s'.repeat(3000)}@h/`, 2000);
    expect(clipped).not.toContain('sss');
  });
});

describe('redactSecrets, round three', () => {
  it('masks a credentialed URL whose username is empty, in full and when clipped', () => {
    expect(redactSecrets('https://:hunter2@example.com/health')).toBe(
      'https://***@example.com/health',
    );
    expect(redactClipped(`https://:${'h'.repeat(3000)}@x/`, 2000)).not.toContain('hhh');
  });

  it('masks an attached credential value whatever punctuation it holds', () => {
    expect(redactSecrets('mysqldump -phunter2! app')).toBe('mysqldump -p*** app');
    expect(redactSecrets('curl -uadmin:hunter2 http://h/')).toBe('curl -u*** http://h/');
    expect(redactSecrets('tool --password -p"alpha hunter2" run')).toBe('tool --password *** run');
    expect(redactSecrets(`tool -p'a b'c run`)).toBe('tool -p*** run');
  });
});

describe('redactSecrets, round four', () => {
  it('masks the whole assignment value, quoted fragments and escapes included', () => {
    expect(redactSecrets(`TOKEN='abc'"d e"f curl http://h/`)).toBe('TOKEN=*** curl http://h/');
    expect(redactSecrets('API_KEY="al\\"pha" run')).toBe('API_KEY=*** run');
  });

  it('masks the equals form of a credential flag like its separated form', () => {
    expect(redactSecrets('curl --user=admin:hunter2 http://h/')).toBe('curl --user=*** http://h/');
    expect(redactSecrets('tool --pass=x --pw=y --login=z --auth=w')).toBe(
      'tool --pass=*** --pw=*** --login=*** --auth=***',
    );
    expect(redactSecrets('USER=root id')).toBe('USER=root id');
  });

  it('masks a quoted credential whose closing quote the clip removed', () => {
    const clipped = redactClipped(`tool --password "${'p'.repeat(3000)}"`, 2000);
    expect(clipped).not.toContain('ppp');
    expect(clipped).toContain('tool --password ***');
    expect(redactClipped(`echo "${'a'.repeat(3000)}"`, 2000)).toContain('aaa');
  });
});
