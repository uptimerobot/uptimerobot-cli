import { afterEach, describe, expect, it, vi } from 'vitest';
import { operations } from '../src/generated/operations.js';
import {
  COLLECTION_COMMAND_IDS,
  COMMAND_COLUMNS,
  type ColumnSpec,
  columnsFor,
  parseColumnsFlag,
} from '../src/output/columns.js';
import { formatOutput } from '../src/output/renderer.js';

const EXPECTED_COLLECTION_COMMAND_IDS = [
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
] as const;

describe('column registry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('curates the complete collection command set', () => {
    expect(COLLECTION_COMMAND_IDS).toEqual(EXPECTED_COLLECTION_COMMAND_IDS);
    expect(Object.keys(COMMAND_COLUMNS).sort()).toEqual(
      [...EXPECTED_COLLECTION_COMMAND_IDS].sort(),
    );
  });

  it('only registers command ids that exist as generated GET operations', () => {
    for (const commandId of COLLECTION_COMMAND_IDS) {
      const operation = operations[commandId];
      expect(operation, commandId).toBeDefined();
      expect(operation.method, commandId).toBe('GET');
    }
  });

  it('curates every generated list command', () => {
    const registered = new Set<string>(COLLECTION_COMMAND_IDS);
    const generatedLists = Object.keys(operations).filter((commandId) =>
      commandId.endsWith(':list'),
    );

    expect(generatedLists.every((commandId) => registered.has(commandId))).toBe(true);
  });

  it('uses non-empty, unique keys within each command', () => {
    for (const [commandId, specs] of Object.entries(COMMAND_COLUMNS)) {
      const keys = specs.map((spec) => spec.key);
      expect(
        keys.every((key) => key.length > 0),
        commandId,
      ).toBe(true);
      expect(new Set(keys).size, commandId).toBe(keys.length);
    }
  });

  it('defines valid editorial width caps for unbounded fields', () => {
    const widthFor = (commandId: (typeof COLLECTION_COMMAND_IDS)[number], key: string) =>
      columnsFor(commandId)?.find((column) => column.key === key)?.maxWidth;

    expect([
      widthFor('monitors:list', 'friendlyName'),
      widthFor('monitors:list', 'url'),
      widthFor('monitors:list', 'tags'),
      widthFor('status-pages:announcements:list', 'title'),
      widthFor('alert-contacts:list', 'value'),
      widthFor('status-pages:list', 'customDomain'),
      widthFor('incidents:comments:list', 'comment'),
      widthFor('incidents:list', 'reason'),
    ]).toEqual([28, 40, 32, 40, 36, 36, 48, 48]);

    for (const specs of Object.values(COMMAND_COLUMNS) as readonly (readonly ColumnSpec[])[]) {
      for (const spec of specs) {
        if (spec.maxWidth === undefined) continue;
        const heading = spec.header ?? spec.key.split('.').at(-1) ?? spec.key;
        expect(Number.isInteger(spec.maxWidth), spec.key).toBe(true);
        expect(spec.maxWidth, spec.key).toBeGreaterThanOrEqual(Math.max(2, heading.length));
      }
    }
  });

  it('returns undefined for commands without curated columns', () => {
    expect(columnsFor('monitors:get')).toBeUndefined();
    expect(columnsFor('user:me')).toBeUndefined();
    expect(columnsFor('monitors:list')).toHaveLength(8);
  });

  it('parses the --columns flag into trimmed dotted-path specs', () => {
    expect(parseColumnsFlag(' id , monitor.friendlyName ,, ')).toEqual([
      { key: 'id' },
      { key: 'monitor.friendlyName' },
    ]);
  });

  it('rejects a --columns flag without a column name', () => {
    for (const value of ['', '   ', ',,,', ' , , ']) {
      expect(() => parseColumnsFlag(value), JSON.stringify(value)).toThrow(
        '--columns must contain at least one column name.',
      );
    }
  });

  it('renders monitors with a humanized interval, target, state age, and tags', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = {
      items: [
        {
          currentStateDuration: 5025,
          friendlyName: 'checkout-api',
          id: 42,
          interval: 60,
          status: 'DOWN',
          tags: [
            { color: '#f00', id: 1, name: 'prod' },
            { color: '#0f0', id: 2, name: 'eu' },
          ],
          type: 'HTTP',
          url: 'https://checkout.example.com',
        },
        {
          friendlyName: null,
          id: 7,
          interval: 300,
          status: 'UP',
          type: 'HTTP',
          url: 'https://example.com',
        },
      ],
    };
    expect(formatOutput('table', payload, { columns: columnsFor('monitors:list') })).toBe(
      'ID  STATUS  NAME                 TYPE  TARGET                        INTERVAL  IN STATE  TAGS\n' +
        '42  ✗ DOWN  checkout-api         HTTP  https://checkout.example.com  1m        1h 23m    prod, eu\n' +
        '7   ● UP    https://example.com  HTTP  https://example.com           5m        —         —',
    );
  });

  it('renders incidents with one root cause and actionable summary fields', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = {
      items: [
        {
          cause: 503,
          commentsCount: 3,
          duration: 754,
          id: '9001',
          monitor: { friendlyName: 'checkout-api', id: 42 },
          reason: '503 Service Unavailable',
          resolvedAt: null,
          startedAt: '2026-07-17T08:00:00Z',
          status: 'Ongoing',
          type: 'Downtime',
        },
      ],
    };
    expect(formatOutput('table', payload, { columns: columnsFor('incidents:list') })).toBe(
      'ID    STATUS     MONITOR       TYPE      ROOT CAUSE               STARTED               DURATION  COMMENTS\n' +
        '9001  ✗ Ongoing  checkout-api  Downtime  503 Service Unavailable  2026-07-17T08:00:00Z  12m 34s   3',
    );
  });

  it('normalizes incident activity variants into a dense table', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = {
      items: [
        {
          alertLogType: 'Down',
          date: '2025-01-09T10:00:00Z',
          incidentStatus: 'DOWN',
          reason: 'Connection timeout',
          remoteNode: { city: 'Dallas', country: 'USA' },
          responseTime: 5000,
          type: 'STATUS_UPDATE',
        },
        {
          commentEmail: 'john@example.com',
          commentFullName: 'John Doe',
          date: '2025-01-09T10:05:00Z',
          type: 'COMMENT',
        },
        {
          date: '2025-01-09T10:01:00Z',
          notificationStatus: 'SUCCESS',
          notificationType: 'Email',
          sentToFullName: 'Jane Doe',
          sentToValue: 'jane@example.com',
          type: 'NOTIFICATION',
        },
      ],
    };

    expect(formatOutput('table', payload, { columns: columnsFor('incidents:activity-log') })).toBe(
      'TIME                  EVENT    DETAIL              REGION       RESULT\n' +
        '2025-01-09T10:00:00Z  DOWN     Connection timeout  Dallas, USA  5000 ms\n' +
        '2025-01-09T10:05:00Z  Comment  John Doe            —            —\n' +
        '2025-01-09T10:01:00Z  Email    Jane Doe            —            ● SUCCESS',
    );
  });

  it('omits integration values from curated output without changing JSON', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = {
      items: [
        {
          enableNotificationsFor: 'UpAndDown',
          friendlyName: 'On-call',
          id: 7,
          status: 'Unknown',
          type: 'PagerDuty',
          value: 'secret-routing-key',
        },
      ],
    };
    const columns = columnsFor('integrations:list');

    expect(formatOutput('table', payload, { columns })).toBe(
      'ID  STATUS   NAME     TYPE       NOTIFY FOR\n' +
        '7   Unknown  On-call  PagerDuty  UpAndDown',
    );
    expect(formatOutput('plain', payload, { columns })).toBe(
      '7\tUnknown\tOn-call\tPagerDuty\tUpAndDown',
    );
    expect(formatOutput('json', payload, { columns })).toBe(JSON.stringify(payload));
  });

  it('renders status pages with a derived access column', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = {
      items: [
        {
          customDomain: null,
          friendlyName: 'Public Status',
          id: 5,
          isPasswordSet: false,
          monitorsCount: 3,
          status: 'ENABLED',
          urlKey: 'abc123',
        },
      ],
    };
    expect(formatOutput('table', payload, { columns: columnsFor('status-pages:list') })).toBe(
      'ID  STATUS     NAME           URL KEY  CUSTOM DOMAIN  MONITORS  ACCESS\n' +
        '5   ● ENABLED  Public Status  abc123   —              3         public',
    );
  });

  it('renders grouped user alert contacts with dotted user fields and joined names', () => {
    vi.stubEnv('NO_COLOR', '1');
    const payload = {
      items: [
        {
          alertContacts: [
            {
              id: 1,
              name: 'E-mail',
              recurrence: 0,
              status: 'active',
              threshold: 0,
              type: 'Email',
              value: 'a@b.c',
            },
            {
              id: 2,
              name: 'Push',
              recurrence: 0,
              status: 'active',
              threshold: 0,
              type: 'MobileApp',
              value: 'phone',
            },
          ],
          notifyOnly: false,
          orgAlertContactId: null,
          user: { id: 11, name: 'Dana Ops' },
        },
      ],
    };
    expect(formatOutput('table', payload, { columns: columnsFor('user:all-alert-contacts') })).toBe(
      'USER ID  USER      NOTIFY ONLY  CONTACTS\n' + '11       Dana Ops  false        E-mail, Push',
    );
  });
});
