import { isPlainRecord } from './objects.js';

/**
 * The heartbeat host the ping URL is built against. Overridable because the
 * host is environment-specific and is not part of the published API contract.
 */
const DEFAULT_HEARTBEAT_HOST = 'https://heartbeat.uptimerobot.com';

/**
 * A heartbeat monitor is inert until something pings its URL, and the API
 * returns the ingredients without ever naming the result: `url` carries the
 * token and the ping endpoint is `<host>/m<id>-<token>`. That composition is
 * how the dashboard builds the URL it shows, but it is documented nowhere, so
 * an API consumer cannot discover it. Deriving it here lets a heartbeat be
 * created and wired up without a trip to the dashboard.
 *
 * Derived rather than authoritative: UPT-3726 asks the API to return the URL
 * itself, and this should give way to that field once it exists.
 */
export function withDerivedFields(payload: unknown, env = process.env): unknown {
  if (Array.isArray(payload)) return payload.map((item) => withDerivedFields(item, env));
  if (!isPlainRecord(payload)) return payload;
  if (Array.isArray(payload.items)) {
    return { ...payload, items: payload.items.map((item) => withDerivedFields(item, env)) };
  }
  const pingUrl = heartbeatPingUrl(payload, env);
  return pingUrl === undefined ? payload : { ...payload, pingUrl };
}

function heartbeatPingUrl(
  monitor: Record<string, unknown>,
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  if (monitor.type !== 'HEARTBEAT') return undefined;
  const { id, url } = monitor;
  if (typeof url !== 'string' || url.length === 0) return undefined;
  if (typeof id !== 'number' && typeof id !== 'string') return undefined;
  const host = (env.UPTIMEROBOT_HEARTBEAT_URL ?? DEFAULT_HEARTBEAT_HOST).replace(/\/+$/, '');
  return `${host}/m${id}-${url}`;
}
