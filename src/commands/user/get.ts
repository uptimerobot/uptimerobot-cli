import { createOperationCommand } from '../../lib/operation-command.js';
import { operations } from '../../generated/operations.js';

export default createOperationCommand(operations['user:me'], {
  canonicalCommand: 'uptimerobot user me',
});
