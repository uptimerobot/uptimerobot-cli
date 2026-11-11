import { isRecord } from './objects.js';

const STOP_WORDS = new Set(
  'and or in on at the a an with for my our we use using run running'.split(' '),
);
const WORD_SEPARATOR = /[^\p{L}\p{N}-]+/u;
const MIN_WORD_LENGTH = 2;

export type Region = { code: string; name: string };
export type Provider = { id: number; name: string };
export type Leaf = Provider & { parentName: string | null; region: Region | null };
export type Found = Leaf & { matchedBy: string };
export type Scope = 'all' | 'list';
export type Monitor = { id: number; scope: Scope; trackedComponentIds: readonly number[] };
export type WordResult = { leaves: Leaf[]; regionLike: boolean; word: string };

export const field = (value: unknown, key: string): unknown =>
  isRecord(value) ? value[key] : undefined;

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(WORD_SEPARATOR)
    .filter((word) => word.length > 0);

export const searchWords = (description: string, providerName: string): string[] => {
  const providerWords = new Set(wordsOf(providerName));
  return [...new Set(wordsOf(description))].filter(
    (word) => word.length >= MIN_WORD_LENGTH && !providerWords.has(word) && !STOP_WORDS.has(word),
  );
};

const serviceNamePhrases = (description: string, providerName: string): string[] => {
  const providerWords = new Set(wordsOf(providerName));
  const words = wordsOf(description);
  return words.flatMap((word, index) =>
    providerWords.has(word) && words[index + 1] === 'run' ? [`${word} run`] : [],
  );
};

const phraseNamingProvider = (description: string, providerName: string): string[] => {
  const providerWords = new Set(wordsOf(providerName));
  const words = wordsOf(description);
  const namesProvider = words.some((word) => providerWords.has(word));
  const saysMore = words.some((word) => word.length >= MIN_WORD_LENGTH && !providerWords.has(word));
  return namesProvider && saysMore ? [words.join(' ')] : [];
};

export const searchTerms = (description: string, providerName: string): string[] => {
  const terms = [
    ...new Set([
      ...serviceNamePhrases(description, providerName),
      ...searchWords(description, providerName),
    ]),
  ];
  return terms.length > 0 ? terms : phraseNamingProvider(description, providerName);
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const occursAsWords = (name: string, text: string): boolean =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'iu').test(text);

export const asProvider = (value: unknown): Provider | undefined => {
  const id = field(value, 'id');
  const name = field(value, 'name');
  return typeof id === 'number' && typeof name === 'string' ? { id, name } : undefined;
};

export const rowsOf = (payload: unknown): unknown[] => {
  const data = field(payload, 'data');
  return Array.isArray(data) ? data : [];
};

const asRegion = (value: unknown): Region | null => {
  const code = field(value, 'code');
  const name = field(value, 'name');
  return typeof code === 'string' && typeof name === 'string' ? { code, name } : null;
};

const asLeaves = (row: unknown, parentName: string | null): Leaf[] => {
  const named = asProvider(row);
  return named ? [{ ...named, parentName, region: asRegion(field(row, 'region')) }] : [];
};

export const leavesIn = (rows: readonly unknown[]): Leaf[] =>
  rows.flatMap((row) => {
    const children = field(row, 'children');
    if (!Array.isArray(children) || children.length === 0) return asLeaves(row, null);
    return children.flatMap((child) => asLeaves(child, asProvider(row)?.name ?? null));
  });

const uniqueById = (found: readonly Found[]): Found[] =>
  found.filter((item, index) => found.findIndex((other) => other.id === item.id) === index);

export const taggedBy = (results: readonly WordResult[]): Found[] =>
  uniqueById(
    results.flatMap(({ leaves, word }) => leaves.map((leaf) => ({ ...leaf, matchedBy: word }))),
  );

export const narrowByRegions = (results: readonly WordResult[]): Found[] => {
  const regionResults = results.filter((result) => result.regionLike);
  const plainResults = results.filter((result) => !result.regionLike);
  if (plainResults.length === 0) return taggedBy(regionResults);
  if (regionResults.length === 0) return taggedBy(plainResults);
  const regionIds = new Set(taggedBy(regionResults).map((leaf) => leaf.id));
  return taggedBy(plainResults).filter((leaf) => regionIds.has(leaf.id));
};

export const asMonitor = (row: unknown, providerId: number): Monitor | undefined => {
  const id = field(row, 'id');
  const service = field(field(row, 'config'), 'thirdPartyService');
  if (
    typeof id !== 'number' ||
    field(row, 'type') !== 'THIRD_PARTY_SERVICE' ||
    field(service, 'providerId') !== providerId
  ) {
    return undefined;
  }
  const tracked = field(service, 'trackedComponentIds');
  const trackedComponentIds = Array.isArray(tracked)
    ? tracked.filter((componentId): componentId is number => typeof componentId === 'number')
    : [];
  return { id, scope: trackedComponentIds.length === 0 ? 'all' : 'list', trackedComponentIds };
};
