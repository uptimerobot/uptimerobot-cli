import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KEYRING_ACCOUNT = 'default:api-key';
const KEYRING_SERVICE = 'com.uptimerobot.cli';
const KEYRING_TIMEOUT_MS = 3000;
const CREDENTIALS_FILENAME = 'credentials.json';

export type CredentialBackend = 'file' | 'keyring';

export interface StoredCredential {
  apiKey: string;
  backend: CredentialBackend;
}

export interface CredentialStore {
  /** Removes the credential. Returns true when one was stored. */
  deleteApiKey(): Promise<boolean>;
  getApiKey(): Promise<StoredCredential | undefined>;
  /** Saves the credential and reports which backend holds it. */
  setApiKey(apiKey: string): Promise<CredentialBackend>;
}

/** The directory that holds the plaintext fallback credential. */
export function configDirectory(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const override = env.UPTIMEROBOT_CONFIG_DIR;
  if (override) return override;
  const xdgConfigHome = env.XDG_CONFIG_HOME;
  return xdgConfigHome
    ? join(xdgConfigHome, 'uptimerobot')
    : join(homedir(), '.config', 'uptimerobot');
}

export function credentialsFilePath(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return join(configDirectory(env), CREDENTIALS_FILENAME);
}

/**
 * OS credential store (macOS Keychain, Windows Credential Manager, Linux
 * Secret Service or kernel keyring). Keyring operations are time-boxed
 * because a missing or locked D-Bus session can hang them on Linux.
 */
class KeyringCredentialStore implements CredentialStore {
  async deleteApiKey(): Promise<boolean> {
    return withKeyringTimeout((await keyringEntry()).deleteCredential());
  }

  async getApiKey(): Promise<StoredCredential | undefined> {
    const apiKey = await withKeyringTimeout((await keyringEntry()).getPassword());
    return apiKey ? { apiKey, backend: 'keyring' } : undefined;
  }

  async setApiKey(apiKey: string): Promise<CredentialBackend> {
    const credential = await keyringEntry();
    await withKeyringTimeout(credential.setPassword(apiKey));
    if ((await withKeyringTimeout(credential.getPassword())) !== apiKey) {
      throw new Error('Credential could not be read back after saving.');
    }
    return 'keyring';
  }
}

/**
 * Stripe-style plaintext fallback for environments without an OS keyring
 * (minimal/headless Linux, containers): a JSON file beneath the CLI config
 * directory with directory 0700 and file 0600 permissions.
 */
class FileCredentialStore implements CredentialStore {
  async deleteApiKey(): Promise<boolean> {
    try {
      await rm(credentialsFilePath());
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async getApiKey(): Promise<StoredCredential | undefined> {
    let raw: string;
    try {
      raw = await readFile(credentialsFilePath(), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      const apiKey =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>).apiKey
          : undefined;
      return typeof apiKey === 'string' && apiKey.length > 0
        ? { apiKey, backend: 'file' }
        : undefined;
    } catch {
      return undefined;
    }
  }

  async setApiKey(apiKey: string): Promise<CredentialBackend> {
    const directory = configDirectory();
    await mkdir(directory, { mode: 0o700, recursive: true });
    await chmod(directory, 0o700).catch(() => {});
    const path = credentialsFilePath();
    const temporary = join(directory, `.${CREDENTIALS_FILENAME}.${process.pid}.tmp`);
    await writeFile(temporary, JSON.stringify({ apiKey }), { mode: 0o600 });
    await rename(temporary, path);
    await chmod(path, 0o600).catch(() => {});
    const stored = await this.getApiKey();
    if (stored?.apiKey !== apiKey) {
      throw new Error('Credential could not be read back after saving.');
    }
    return 'file';
  }
}

/**
 * Prefers the OS keyring and falls back to the plaintext config file when
 * the keyring is unavailable. Reads prefer the keyring so a credential
 * migrated there takes precedence over a stale file.
 */
class FallbackCredentialStore implements CredentialStore {
  constructor(
    private readonly keyring: CredentialStore,
    private readonly file: CredentialStore,
  ) {}

  async deleteApiKey(): Promise<boolean> {
    const [keyring, file] = await Promise.allSettled([
      this.keyring.deleteApiKey(),
      this.file.deleteApiKey(),
    ]);
    if (keyring.status === 'rejected' && file.status === 'rejected') throw keyring.reason;
    return (
      (keyring.status === 'fulfilled' && keyring.value) ||
      (file.status === 'fulfilled' && file.value)
    );
  }

  async getApiKey(): Promise<StoredCredential | undefined> {
    try {
      const stored = await this.keyring.getApiKey();
      if (stored) return stored;
    } catch {
      // The keyring is unavailable; fall back to the config file.
    }
    return this.file.getApiKey();
  }

  async setApiKey(apiKey: string): Promise<CredentialBackend> {
    try {
      return await this.keyring.setApiKey(apiKey);
    } catch {
      return this.file.setApiKey(apiKey);
    }
  }
}

export const credentialStore: CredentialStore = new FallbackCredentialStore(
  new KeyringCredentialStore(),
  new FileCredentialStore(),
);

async function keyringEntry() {
  const { AsyncEntry } = await import('@napi-rs/keyring');
  return new AsyncEntry(KEYRING_SERVICE, KEYRING_ACCOUNT);
}

function withKeyringTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('The OS credential store did not respond in time.')),
      KEYRING_TIMEOUT_MS,
    );
  });
  return Promise.race([operation.finally(() => clearTimeout(timer)), timeout]);
}
