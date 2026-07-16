import type { OutputFormat } from './resolve-format.js';

type Formatter = (payload: unknown) => string | undefined;

const FORMATTERS = {
  json: formatJson,
  jsonl: formatJsonLines,
  plain: formatPlain,
  table: formatTable,
} satisfies Record<OutputFormat, Formatter>;

export function formatOutput(format: OutputFormat, payload: unknown): string | undefined {
  return FORMATTERS[format](payload);
}

function formatJson(payload: unknown): string | undefined {
  return JSON.stringify(payload);
}

function formatJsonLines(payload: unknown): string | undefined {
  const collection = extractCollection(payload);
  if (collection) {
    if (collection.length === 0) return undefined;
    return collection.map((item) => JSON.stringify(item)).join('\n');
  }
  return JSON.stringify(payload);
}

function formatPlain(payload: unknown): string | undefined {
  const collection = extractCollection(payload);
  if (!collection) return formatValue(payload, '');
  if (collection.length === 0) return undefined;
  const columns = firstColumns(collection);
  return collection
    .map((item) =>
      isRecord(item)
        ? columns.map((column) => formatValue(item[column], '')).join('\t')
        : formatValue(item, ''),
    )
    .join('\n');
}

function formatTable(payload: unknown): string | undefined {
  const data = extractCollection(payload);
  if (!data) return JSON.stringify(payload, null, 2);
  if (data.length === 0) return 'No results.';
  const columns = firstColumns(data);
  const rows = data.map((item) => {
    const row = isRecord(item) ? item : { value: item };
    return columns.map((column) => formatValue(row[column], '—'));
  });
  const headings = columns.map((column) =>
    column.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase(),
  );
  const widths = columns.map((_, index) =>
    Math.max(headings[index]!.length, ...rows.map((row) => row[index]!.length)),
  );
  return [formatRow(headings, widths), ...rows.map((row) => formatRow(row, widths))].join('\n');
}

function extractCollection(payload: unknown): unknown[] | undefined {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return undefined;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return undefined;
}

function firstColumns(rows: unknown[]): string[] {
  const first = rows[0];
  if (!isRecord(first)) return ['value'];
  return Object.keys(first).slice(0, 8);
}

function formatRow(values: string[], widths: number[]): string {
  return values
    .map((value, index) => value + ' '.repeat(Math.max(0, widths[index]! - value.length)))
    .join('  ')
    .trimEnd();
}

function formatValue(value: unknown, nullValue: string): string {
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value === undefined || value === null ? nullValue : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
