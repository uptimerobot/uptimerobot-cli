import { operations } from '../generated/operations.js';

/**
 * Commands implemented by hand rather than generated from the OpenAPI
 * contract. A test asserts that each entry maps to a compiled command file,
 * so renames and removals break CI instead of silently dropping suggestions.
 */
export const HANDWRITTEN_COMMANDS = [
  'auth login',
  'auth logout',
  'auth status',
  'auth whoami',
  'help',
  'monitors schema',
  'skills install',
] as const;
const commands = [
  ...Object.keys(operations).map((commandId) => commandId.replaceAll(':', ' ')),
  ...HANDWRITTEN_COMMANDS,
];

export function commandSuggestion(argv: readonly string[]): string | undefined {
  const firstFlag = argv.findIndex((value) => value.startsWith('-'));
  const input = (firstFlag === -1 ? argv : argv.slice(0, firstFlag)).join(' ');
  if (!input) return undefined;

  const ranked = commands
    .map((command) => ({ command, distance: editDistance(input, command) }))
    .sort(
      (left, right) => left.distance - right.distance || left.command.localeCompare(right.command),
    );
  const best = ranked[0];
  if (!best || best.distance > Math.max(2, Math.floor(input.length * 0.2))) return undefined;
  if (ranked[1]?.distance === best.distance) return undefined;
  return best.command;
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}
