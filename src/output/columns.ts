import type { operations } from '../generated/operations.js';
import { isRecord } from '../lib/objects.js';

// Editorial registry of the columns each list command displays in table/plain
// output. Column relevance mirrors the web dashboard's list views and the MCP
// server's per-entity list schemas; keys are raw public-API field names from
// openapi/openapi.yaml. Commands without an entry fall back to response field order.
export interface ColumnSpec {
  /** Derives the cell value; receives the path-resolved value and the whole row. */
  format?: (value: unknown, row: Record<string, unknown>) => unknown;
  /** Header label override; defaults to the de-camelized last path segment. */
  header?: string;
  /** Dotted-path accessor into the row, e.g. 'monitor.friendlyName'. */
  key: string;
  /** Maximum table width in Unicode code points; plain and structured output ignore it. */
  maxWidth?: number;
}

type OperationCommandId = keyof typeof operations;

export const COLLECTION_COMMAND_IDS = [
  'alert-contacts:list',
  'incidents:activity-log',
  'incidents:alerts',
  'incidents:comments:list',
  'incidents:list',
  'integrations:list',
  'maintenance-windows:list',
  'monitor-groups:list',
  'monitors:list',
  'status-pages:announcements:list',
  'status-pages:list',
  'tags:list',
  'user:alert-contacts',
  'user:all-alert-contacts',
] as const satisfies readonly OperationCommandId[];

export type CollectionCommandId = (typeof COLLECTION_COMMAND_IDS)[number];
type ColumnSet = readonly [ColumnSpec, ...ColumnSpec[]];

const ALERT_CONTACT_COLUMNS = [
  { key: 'id' },
  { key: 'status' },
  { header: 'NAME', key: 'friendlyName', maxWidth: 28 },
  { key: 'type' },
  { key: 'value', maxWidth: 36 },
  { header: 'NOTIFY FOR', key: 'enableNotificationsFor' },
] satisfies ColumnSet;

export const COMMAND_COLUMNS = {
  'alert-contacts:list': ALERT_CONTACT_COLUMNS,
  'incidents:activity-log': [
    { header: 'TIME', key: 'date' },
    { format: activityEvent, header: 'EVENT', key: 'type' },
    { format: activityDetail, header: 'DETAIL', key: 'reason', maxWidth: 48 },
    { format: activityRegion, header: 'REGION', key: 'region' },
    { format: activityResult, header: 'RESULT', key: 'notificationStatus' },
  ],
  'incidents:alerts': [
    { key: 'timestamp' },
    { key: 'status' },
    { header: 'RECIPIENT', key: 'recipientName', maxWidth: 28 },
    { header: 'CONTACT', key: 'recipientValue', maxWidth: 36 },
    { header: 'CHANNEL', key: 'channelType' },
  ],
  'incidents:comments:list': [
    { key: 'id' },
    { key: 'created' },
    { header: 'AUTHOR', key: 'user.fullName', maxWidth: 28 },
    { key: 'comment', maxWidth: 48 },
  ],
  'incidents:list': [
    { key: 'id' },
    { key: 'status' },
    { header: 'MONITOR', key: 'monitor.friendlyName', maxWidth: 28 },
    { key: 'type' },
    { format: rootCause, header: 'ROOT CAUSE', key: 'reason', maxWidth: 48 },
    { header: 'STARTED', key: 'startedAt' },
    { format: durationSeconds, key: 'duration' },
    { header: 'COMMENTS', key: 'commentsCount' },
  ],
  'integrations:list': [
    { key: 'id' },
    { key: 'status' },
    { header: 'NAME', key: 'friendlyName', maxWidth: 28 },
    { key: 'type' },
    { header: 'NOTIFY FOR', key: 'enableNotificationsFor' },
  ],
  'maintenance-windows:list': [
    { key: 'id' },
    { key: 'status' },
    { key: 'name', maxWidth: 28 },
    { header: 'REPEAT', key: 'interval' },
    { key: 'date' },
    { key: 'time' },
    { header: 'DURATION (MIN)', key: 'duration' },
  ],
  'monitor-groups:list': [
    { key: 'id' },
    { key: 'name', maxWidth: 28 },
    { key: 'createdAt' },
    { key: 'updatedAt' },
  ],
  'monitors:list': [
    { key: 'id' },
    { key: 'status' },
    { format: nameOrUrl, header: 'NAME', key: 'friendlyName', maxWidth: 28 },
    { key: 'type' },
    { header: 'TARGET', key: 'url', maxWidth: 40 },
    { format: durationSeconds, key: 'interval' },
    { format: stateAge, header: 'IN STATE', key: 'currentStateDuration' },
    { format: joinNames, key: 'tags', maxWidth: 32 },
  ],
  'status-pages:announcements:list': [
    { key: 'id' },
    { key: 'title', maxWidth: 40 },
    { key: 'status' },
    { key: 'type' },
    { key: 'startDate' },
    { key: 'endDate' },
    { key: 'deliveryStatus' },
  ],
  'status-pages:list': [
    { key: 'id' },
    { key: 'status' },
    { header: 'NAME', key: 'friendlyName', maxWidth: 28 },
    { key: 'urlKey' },
    { key: 'customDomain', maxWidth: 36 },
    { header: 'MONITORS', key: 'monitorsCount' },
    { format: accessLevel, header: 'ACCESS', key: 'isPasswordSet' },
  ],
  'tags:list': [{ key: 'id' }, { key: 'name', maxWidth: 28 }],
  'user:alert-contacts': ALERT_CONTACT_COLUMNS,
  'user:all-alert-contacts': [
    { header: 'USER ID', key: 'user.id' },
    { header: 'USER', key: 'user.name', maxWidth: 28 },
    { key: 'notifyOnly' },
    { format: joinNames, header: 'CONTACTS', key: 'alertContacts', maxWidth: 32 },
  ],
} satisfies Record<CollectionCommandId, ColumnSet>;

export function columnsFor(commandId: string): ColumnSet | undefined {
  if (!Object.hasOwn(COMMAND_COLUMNS, commandId)) return undefined;
  return COMMAND_COLUMNS[commandId as CollectionCommandId];
}

export function parseColumnsFlag(value: string): ColumnSpec[] {
  const keys = value
    .split(',')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  if (keys.length === 0) throw new Error('--columns must contain at least one column name.');
  return keys.map((key) => ({ key }));
}

function nameOrUrl(value: unknown, row: Record<string, unknown>): unknown {
  return value ?? row.url;
}

function rootCause(value: unknown, row: Record<string, unknown>): unknown {
  return value ?? row.cause;
}

function activityEvent(value: unknown, row: Record<string, unknown>): unknown {
  if (value === 'STATUS_UPDATE') {
    return firstString(row.incidentStatus, row.alertLogType) ?? 'Status update';
  }
  if (value === 'COMMENT') return 'Comment';
  if (value === 'NOTIFICATION') return firstString(row.notificationType) ?? 'Notification';
  return value;
}

function activityDetail(_value: unknown, row: Record<string, unknown>): unknown {
  if (row.type === 'STATUS_UPDATE') return row.reason;
  if (row.type === 'COMMENT') return firstString(row.commentFullName, row.commentEmail);
  if (row.type === 'NOTIFICATION') return firstString(row.sentToFullName, row.sentToValue);
  return undefined;
}

function activityRegion(value: unknown, row: Record<string, unknown>): unknown {
  const region = firstString(value);
  if (region !== undefined) return region;
  if (!isRecord(row.remoteNode)) return undefined;
  const location = [row.remoteNode.city, row.remoteNode.country].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  );
  return location.length > 0 ? location.join(', ') : undefined;
}

function activityResult(value: unknown, row: Record<string, unknown>): unknown {
  if (row.type === 'STATUS_UPDATE') {
    return typeof row.responseTime === 'number' && Number.isFinite(row.responseTime)
      ? `${row.responseTime} ms`
      : undefined;
  }
  if (row.type === 'NOTIFICATION') return value;
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function durationSeconds(value: unknown): unknown {
  return humanizeDuration(value, 4);
}

// State ages reach hundreds of days, where trailing minutes and seconds are
// noise in a scannable column.
function stateAge(value: unknown): unknown {
  return humanizeDuration(value, 2);
}

function humanizeDuration(value: unknown, maxUnits: number): unknown {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  const units: [string, number][] = [
    ['d', 86_400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ];
  const parts: string[] = [];
  let remaining = Math.floor(value);
  for (const [suffix, size] of units) {
    const amount = Math.floor(remaining / size);
    remaining %= size;
    if (amount > 0) parts.push(`${amount}${suffix}`);
    if (parts.length === maxUnits) break;
  }
  return parts.length > 0 ? parts.join(' ') : '0s';
}

function joinNames(value: unknown): unknown {
  if (!Array.isArray(value)) return undefined;
  const names = value
    .map((item) => (isRecord(item) ? item.name : undefined))
    .filter((name): name is string => typeof name === 'string');
  return names.length > 0 ? names.join(', ') : undefined;
}

function accessLevel(value: unknown): unknown {
  if (value === true) return 'password';
  if (value === false) return 'public';
  return undefined;
}
