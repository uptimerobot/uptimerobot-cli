import AuthStatus from './status.js';

export default class AuthWhoami extends AuthStatus {
  static override description = `${AuthStatus.description}

Canonical command: uptimerobot auth status`;
}
