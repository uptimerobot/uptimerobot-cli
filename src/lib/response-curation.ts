import { isPlainRecord } from './objects.js';

/**
 * The heartbeat host the ping URL is composed against when the API does not
 * supply it. Overridable because the host is environment-specific.
 */
const DEFAULT_HEARTBEAT_HOST = 'https://heartbeat.uptimerobot.com';

/**
 * A heartbeat monitor is inert until something pings its URL. The API returns
 * that URL as `heartbeatUrl`; `pingUrl` predates the field and stays because it
 * is part of the 1.0 output contract, so it now mirrors the API's value. Only a
 * response without `heartbeatUrl` falls back to composing `<host>/m<id>-<token>`
 * from `id` and the token in `url`, the same way the API builds it.
 */
export function withDerivedFields(payload: unknown, env = process.env): unknown {
  if (Array.isArray(payload)) return payload.map((item) => withDerivedFields(item, env));
  if (!isPlainRecord(payload)) return payload;
  if (Array.isArray(payload.items)) {
    return { ...payload, items: payload.items.map((item) => withDerivedFields(item, env)) };
  }
  // An API-supplied value wins: the CLI must never shadow a real field.
  if (typeof payload.pingUrl === 'string') return payload;
  const pingUrl = heartbeatPingUrl(payload, env);
  return pingUrl === undefined ? payload : { ...payload, pingUrl };
}

function heartbeatPingUrl(
  monitor: Record<string, unknown>,
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  if (monitor.type !== 'HEARTBEAT') return undefined;
  const { heartbeatUrl, id, url } = monitor;
  if (typeof heartbeatUrl === 'string' && heartbeatUrl.length > 0) return heartbeatUrl;
  if (typeof url !== 'string' || url.length === 0) return undefined;
  if (typeof id !== 'number' && typeof id !== 'string') return undefined;
  const host = (env.UPTIMEROBOT_HEARTBEAT_URL ?? DEFAULT_HEARTBEAT_HOST).replace(/\/+$/, '');
  return `${host}/m${id}-${url}`;
}
