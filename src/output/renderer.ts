import { isRecord } from '../lib/objects.js';
import type { ColumnSpec } from './columns.js';
import { displayWidth, truncateToWidth } from './display-width.js';
import type { OutputFormat } from './resolve-format.js';
import { paint, type PaintStyle, statusGlyph } from './style.js';

export interface RenderOptions {
  /** Render every field across all rows instead of curated or first-8 columns. */
  allColumns?: boolean;
  /** Explicit column selection; wins over allColumns and the fallback. */
  columns?: readonly ColumnSpec[];
}

type Formatter = (payload: unknown, options: RenderOptions) => string | undefined;
const DEFAULT_TABLE_COLUMN_WIDTH = 48;

const FORMATTERS = {
  json: formatJson,
  jsonl: formatJsonLines,
  plain: formatPlain,
  table: formatTable,
} satisfies Record<OutputFormat, Formatter>;

export function formatOutput(
  format: OutputFormat,
  payload: unknown,
  options: RenderOptions = {},
): string | undefined {
  return FORMATTERS[format](payload, options);
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

function formatPlain(payload: unknown, options: RenderOptions): string | undefined {
  const collection = extractCollection(payload);
  if (!collection) return formatValue(payload, '');
  if (collection.length === 0) return undefined;
  const columns = resolveColumns(collection, options);
  return collection
    .map((item) =>
      isRecord(item)
        ? columns.map((column) => renderCell(item, column, '')).join('\t')
        : formatValue(item, ''),
    )
    .join('\n');
}

interface TableCell {
  style?: PaintStyle;
  text: string;
}

function formatTable(payload: unknown, options: RenderOptions): string | undefined {
  const data = extractCollection(payload);
  if (!data) return JSON.stringify(payload, null, 2);
  if (data.length === 0) return 'No results.';
  const columns = resolveColumns(data, options);
  const rows = data.map((item) => {
    const row = isRecord(item) ? item : { value: item };
    return columns.map((column) => {
      const cell = toCell(column.key, singleLine(renderCell(row, column, '—')));
      return { ...cell, text: truncate(cell.text, column.maxWidth) };
    });
  });
  const headings = columns.map(
    (column): TableCell => ({ style: 'bold', text: truncate(column.header, column.maxWidth) }),
  );
  const widths = columns.map((_, index) =>
    Math.max(
      displayWidth(headings[index]!.text),
      ...rows.map((row) => displayWidth(row[index]!.text)),
    ),
  );
  return [formatRow(headings, widths), ...rows.map((row) => formatRow(row, widths))].join('\n');
}

interface ResolvedColumn {
  format?: ColumnSpec['format'];
  header: string;
  key: string;
  maxWidth: number;
}

function resolveColumns(rows: unknown[], options: RenderOptions): ResolvedColumn[] {
  if (options.columns !== undefined && options.columns.length > 0) {
    return options.columns.map((spec) => ({
      format: spec.format,
      header: (spec.header ?? defaultHeader(lastSegment(spec.key))).toUpperCase(),
      key: spec.key,
      maxWidth: spec.maxWidth ?? DEFAULT_TABLE_COLUMN_WIDTH,
    }));
  }
  const keys = options.allColumns === true ? allKeys(rows) : firstColumns(rows);
  return keys.map((key) => ({
    header: defaultHeader(key),
    key,
    maxWidth: DEFAULT_TABLE_COLUMN_WIDTH,
  }));
}

function defaultHeader(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

function lastSegment(key: string): string {
  const segments = key.split('.');
  return segments[segments.length - 1] ?? key;
}

function renderCell(
  row: Record<string, unknown>,
  column: ResolvedColumn,
  nullValue: string,
): string {
  const value = resolvePath(row, column.key);
  return formatValue(column.format ? column.format(value, row) : value, nullValue);
}

function resolvePath(row: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return row[path];
  return path
    .split('.')
    .reduce<unknown>((value, segment) => (isRecord(value) ? value[segment] : undefined), row);
}

function toCell(column: string, text: string): TableCell {
  if (!/status$/i.test(column)) return { text };
  const status = statusGlyph(text);
  if (!status) return { text };
  return { style: status.style, text: `${status.glyph} ${text}` };
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

function allKeys(rows: unknown[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    for (const key of Object.keys(row)) keys.add(key);
  }
  return keys.size > 0 ? [...keys] : ['value'];
}

function formatRow(cells: TableCell[], widths: number[]): string {
  return cells
    .map((cell, index) => {
      const padding = ' '.repeat(Math.max(0, widths[index]! - displayWidth(cell.text)));
      return (cell.style === undefined ? cell.text : paint(cell.style, cell.text)) + padding;
    })
    .join('  ')
    .trimEnd();
}

function truncate(value: string, maxWidth: number): string {
  return truncateToWidth(value, maxWidth);
}

function singleLine(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ');
}

function formatValue(value: unknown, nullValue: string): string {
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value === undefined || value === null ? nullValue : String(value);
}
