const KEYRING_ACCOUNT = 'default:api-key';
const KEYRING_SERVICE = 'com.uptimerobot.cli';

export interface CredentialStore {
  deleteApiKey(): Promise<boolean>;
  getApiKey(): Promise<string | undefined>;
  setApiKey(apiKey: string): Promise<void>;
}

export class OsCredentialStore implements CredentialStore {
  async deleteApiKey(): Promise<boolean> {
    return (await entry()).deleteCredential();
  }

  async getApiKey(): Promise<string | undefined> {
    return (await entry()).getPassword();
  }

  async setApiKey(apiKey: string): Promise<void> {
    const credential = await entry();
    await credential.setPassword(apiKey);
    if ((await credential.getPassword()) !== apiKey) {
      throw new Error('Credential could not be read back after saving.');
    }
  }
}

export const credentialStore: CredentialStore = new OsCredentialStore();

async function entry() {
  const { AsyncEntry } = await import('@napi-rs/keyring');
  return new AsyncEntry(KEYRING_SERVICE, KEYRING_ACCOUNT);
}
