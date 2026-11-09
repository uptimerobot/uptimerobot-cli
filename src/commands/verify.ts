import { Flags } from '@oclif/core';
import { createApiClient, requestJson } from '../api/client.js';
import { ApiFailure } from '../api/errors.js';
import { formatInvocation, resolveCliInvocation } from '../lib/agent-setup/cli-invocation.js';
import { AGENT_SETUP_TAG } from '../lib/agent-setup/tag.js';
import { AuthenticationError, resolveApiKey } from '../lib/auth.js';
import { BaseCommand } from '../lib/base-command.js';
import { operations } from '../generated/operations.js';
import type { InvocationMode } from '../lib/invocation.js';
import { detectInvocationMode, isCI } from '../lib/invocation.js';
import { isPlainRecord, isRecord } from '../lib/objects.js';
import { MAX_PAGES, PAGE_SIZE, type PageResult, pageThrough } from '../lib/paginate.js';
import { buildUrl } from '../lib/request.js';
import type { ColumnSpec } from '../output/columns.js';
import { formatOutput } from '../output/renderer.js';
import { resolveFormat } from '../output/resolve-format.js';

/**
 * Reads the API for monitors an agent setup left behind.
 *
 * `uptimerobot init` hands the repository to the caller's own coding agent,
 * which creates monitors and then writes `uptimerobot-report.md` describing
 * what it did. That file is the agent's account of its own work. This command
 * is the independent half: it asks the API what exists, so the report can be
 * checked rather than believed.
 */

/** The whole point of the command, so it belongs in the run report the agent is checked against. */
const RUN_REPORT_FILE_NAME = 'uptimerobot-report.md';

const MONITORS_LIST = operations['monitors:list'];

/**
 * What this command cannot see, stated once and rendered in both output modes
 * so the human text and the JSON can never drift apart.
 */
const COVERAGE_NOTE_LINES = [
  'Only monitors carrying a tag are visible here.',
  'The email-only quick setup creates monitors through a signature-bound endpoint that accepts no tags, so that path reports zero here even when it succeeded.',
  'Tags are replaced wholesale on update, so a later edit that omits the tag drops a monitor from this list.',
  'Treat the count as a floor, not a total.',
] as const;
const COVERAGE_NOTE = COVERAGE_NOTE_LINES.join(' ');

const MONITOR_COLUMNS: readonly ColumnSpec[] = [
  { key: 'id' },
  { key: 'status' },
  { header: 'NAME', key: 'name', maxWidth: 28 },
  { key: 'type' },
  { key: 'target', maxWidth: 40 },
  { format: joinTags, key: 'tags', maxWidth: 24 },
  { header: 'CREATED', key: 'createdAt' },
];

/** One monitor, reduced to what a person needs to check a claim against. */
interface VerifiedMonitor {
  /** Whatever the API reports; never reinterpreted, because an epoch guess could be wrong. */
  createdAt: string | null;
  id: number | string | null;
  name: string | null;
  status: string | null;
  /** Every tag on the monitor, not only the ones filtered for. */
  tags: readonly string[];
  /** The monitored URL or host; null for types that have none, such as heartbeats. */
  target: string | null;
  type: string | null;
}

interface VerifyOutput {
  count: number;
  /** What the count rests on, and what it therefore misses. */
  coverage: { basis: 'tags'; note: string };
  monitors: readonly VerifiedMonitor[];
  /** The tag names that were filtered for, in the order they were given. */
  tags: readonly string[];
  /** True when paging stopped early, at the page cap or a repeated cursor, so `monitors` is not the whole answer. */
  truncated: boolean;
}

export default class Verify extends BaseCommand {
  static override description = `Asks the API which monitors carry the \`${AGENT_SETUP_TAG}\` tag and reports each one's name, type, target, ID, status and creation time — enough to compare line by line against the ${RUN_REPORT_FILE_NAME} an agent writes about its own work.

Nothing is written and nothing is changed; the command only reads, and can be run as often as you like.

${COVERAGE_NOTE_LINES.join('\n')}

Finding no monitors is a result, not a failure: the command exits 0 whether the count is zero or a hundred. Only an unusable API key, an API error or an unreachable network is an error.`;

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --json',
    '<%= config.bin %> <%= command.id %> --tags agent-setup,production',
  ];

  static override flags = {
    'api-key': Flags.string({
      description: 'UptimeRobot API key',
      env: 'UPTIMEROBOT_API_KEY',
      helpValue: '<key>',
    }),
    agent: Flags.boolean({ description: 'Mark this invocation as agent-driven' }),
    json: Flags.boolean({ description: 'Emit structured JSON output' }),
    // Spelled and punctuated exactly like the API's own filter, so there is no
    // second dialect to learn: comma-separated, case-sensitive, OR logic. Note
    // that creating a monitor spells the same idea `--tag-names`, one flag per
    // tag; that asymmetry is the API's, not this command's.
    tags: Flags.string({
      default: AGENT_SETUP_TAG,
      description:
        'Comma-separated tag names to look for; case-sensitive, and a monitor matches if it carries any of them',
      helpValue: '<a,b>',
    }),
  };

  static override summary = 'Check the API for the monitors an agent setup created';

  async run(): Promise<VerifyOutput> {
    const { flags } = await this.parse(Verify);
    const mode = detectInvocationMode(flags.agent === true);
    const format = resolveFormat({ json: flags.json }, mode);
    const machineOutput = format === 'json' || format === 'jsonl';
    const tags = parseTags(flags.tags);
    if (tags.length === 0) {
      return this.fail(
        {
          code: 'INVALID_INPUT',
          expected: 'at least one tag name',
          message: '--tags must contain at least one tag name.',
          path: 'tags',
        },
        2,
      );
    }

    const apiUrl = new URL(process.env.UPTIMEROBOT_DEV_API_URL ?? MONITORS_LIST.defaultApiUrl);
    let apiKey: string;
    try {
      apiKey = await resolveApiKey(flags['api-key'], apiUrl.toString());
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return this.fail({ code: error.code, message: error.message }, error.exitCode);
      }
      throw error;
    }

    const { monitors, paging } = await this.collectMonitors(tags, apiUrl, apiKey, mode);
    const output: VerifyOutput = {
      count: monitors.length,
      coverage: { basis: 'tags', note: COVERAGE_NOTE },
      monitors,
      tags,
      truncated: paging.truncated,
    };

    if (machineOutput) this.log(JSON.stringify(output));
    else for (const line of await reportLines(output)) this.log(line);
    // Matches how a short page reports the rest of a collection: the finding
    // goes to stdout, the caveat about the finding goes to stderr.
    if (paging.truncated && !machineOutput) {
      const stopped =
        paging.reason === 'page-cap'
          ? `Stopped after ${MAX_PAGES} pages.`
          : 'Stopped at a cursor the API had already handed out.';
      this.logToStderr(
        `${stopped} More monitors carry ${tags.length === 1 ? 'this tag' : 'these tags'} than are listed above.`,
      );
    }
    return output;
  }

  /**
   * Every page of the filtered list, because the API caps a page at 200 and a
   * verification that quietly stopped at the first page would under-report the
   * very thing it exists to count.
   */
  private async collectMonitors(
    tags: readonly string[],
    apiUrl: URL,
    apiKey: string,
    mode: InvocationMode,
  ): Promise<{ monitors: VerifiedMonitor[]; paging: PageResult }> {
    const client = createApiClient({
      apiKey,
      apiUrl,
      environment: isCI() ? 'ci' : 'local',
      mode,
      version: this.config.pjson.version,
    });
    const monitors: VerifiedMonitor[] = [];
    try {
      const paging = await pageThrough({
        // Built from the same generated operation `monitors list` uses, so a
        // change to the path or the parameter names cannot leave this command
        // querying a contract that no longer exists.
        fetchPage: (cursor) =>
          requestJson(
            client,
            buildUrl(
              MONITORS_LIST,
              { path: {}, query: { cursor, limit: PAGE_SIZE, tags: tags.join(',') } },
              apiUrl,
            ),
            MONITORS_LIST.method,
          ),
        onItems: (items) => {
          for (const item of items) monitors.push(verifiedMonitor(item));
        },
      });
      return { monitors, paging };
    } catch (error) {
      if (error instanceof ApiFailure) return this.fail(error.cliError, error.exitCode);
      throw error;
    }
  }
}

/**
 * The human form of the same result `--json` emits: the headline first so it
 * survives a scroll, then the evidence, then what the evidence does not cover.
 */
async function reportLines(output: VerifyOutput): Promise<readonly string[]> {
  const filter = `the tag ${output.tags[0]}`;
  const description =
    output.tags.length === 1 ? filter : `any of the tags ${output.tags.join(', ')}`;

  if (output.count === 0) {
    // Resolved only on this path, because it is the only one that names a
    // command to run next, and a caller who arrived through npx must not be
    // told to run a binary they do not have.
    const invocation = await resolveCliInvocation();
    return [
      `No monitors carry ${description}.`,
      '',
      COVERAGE_NOTE,
      `Zero here does not prove nothing was created — list the whole account with \`${formatInvocation(invocation, 'monitors list')}\`.`,
    ];
  }

  return [
    `${output.count} monitor${output.count === 1 ? '' : 's'} carr${output.count === 1 ? 'ies' : 'y'} ${description}.`,
    '',
    formatOutput('table', { items: output.monitors }, { columns: MONITOR_COLUMNS }) ?? '',
    '',
    `Compare this against ${RUN_REPORT_FILE_NAME}: the report is the agent's account of its work, this is the API's.`,
    COVERAGE_NOTE,
  ];
}

/**
 * Splits the API's own comma-separated spelling. Surrounding whitespace is
 * dropped so `--tags "a, b"` works, which matters more than supporting a tag
 * whose name genuinely begins with a space.
 */
function parseTags(value: string): readonly string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function verifiedMonitor(item: unknown): VerifiedMonitor {
  const row = isPlainRecord(item) ? item : {};
  return {
    createdAt: text(row.createDateTime),
    id: identifier(row.id),
    name: text(row.friendlyName),
    status: text(row.status),
    tags: tagNames(row.tags),
    target: text(row.url),
    type: text(row.type),
  };
}

/** Kept as a number when the API sends one, so it can be fed straight back to `monitors get`. */
function identifier(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function tagNames(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (isRecord(tag) ? tag.name : tag))
    .filter((name): name is string => typeof name === 'string' && name.length > 0);
}

function joinTags(value: unknown): unknown {
  return Array.isArray(value) && value.length > 0 ? value.join(', ') : undefined;
}
