import { createInterface } from 'node:readline/promises';
import { Flags } from '@oclif/core';
import type { ApiClient, ApiResult } from '../../api/client.js';
import { authenticatedClient, networkFailure, requireOk } from '../../lib/api-transport.js';
import { PRODUCTION_API_URL } from '../../lib/auth.js';
import { BaseCommand } from '../../lib/base-command.js';
import {
  confirmationAvailable,
  detectInvocationMode,
  type InvocationMode,
  requestConfirmation,
} from '../../lib/invocation.js';
import {
  asMonitor,
  asProvider,
  field,
  type Found,
  leavesIn,
  type Monitor,
  narrowByRegions,
  occursAsWords,
  type Provider,
  rowsOf,
  searchTerms,
  type WordResult,
} from '../../lib/third-party-scan.js';
import { SCAN_THIRD_PARTY_COLUMNS } from '../../output/columns.js';
import { formatOutput } from '../../output/renderer.js';
import { type OutputFormat, resolveFormat } from '../../output/resolve-format.js';

const COMMAND = 'scan:3rd-party';
const DASHBOARD_URL = 'https://dashboard.uptimerobot.com/3rd-party-services';
const MAX_DESCRIPTION_LENGTH = 100;
const MONITOR_PAGE_SIZE = '200';

type Candidate = Found & { tracked: boolean };
type Scan = { candidates: Candidate[]; monitor: Monitor | undefined; provider: Provider };
type Send = (method: 'GET' | 'PATCH' | 'POST', url: URL, body?: unknown) => Promise<ApiResult>;
type Api = { apiUrl: URL; send: Send };

const clip = (text: string): string => text.trim().slice(0, MAX_DESCRIPTION_LENGTH);

const buildUrl = (apiUrl: URL, path: string, query: Record<string, string> = {}): URL => {
  const url = new URL(`${apiUrl.toString().replace(/\/$/, '')}${path}`);
  Object.entries(query).forEach(([name, value]) => url.searchParams.set(name, value));
  return url;
};

const isJson = (format: OutputFormat): boolean => format === 'json' || format === 'jsonl';

const descriptionHint = (provider: string): string =>
  `What do you use on ${provider}? (for example: Lambda and DynamoDB in Oregon)`;

const askDescription = async (question: string): Promise<string> => {
  const reader = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return clip(await reader.question(question));
  } finally {
    reader.close();
  }
};

const sender =
  (client: ApiClient): Send =>
  async (method, url, body) => {
    try {
      return await client.request(url, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method,
      });
    } catch (error) {
      throw networkFailure(error);
    }
  };

export default class ScanThirdParty extends BaseCommand {
  static override description =
    "The description is sent to UptimeRobot's catalog search and nowhere else; the command reads no files or cloud accounts. Use the full service names the provider's status page uses, for example Simple Storage Service, not S3.";
  static override examples = [
    '<%= config.bin %> scan 3rd-party --provider "AWS" --describe "Lambda and DynamoDB in Oregon"',
    '<%= config.bin %> scan 3rd-party --describe "free workers on cloudflare"',
    '<%= config.bin %> scan 3rd-party --provider "AWS" --region us-west-2 --dry-run --json',
  ];
  static override flags = {
    'api-key': Flags.string({
      description: 'UptimeRobot API key (defaults to the stored key)',
      env: 'UPTIMEROBOT_API_KEY',
      helpValue: '<key>',
    }),
    confirm: Flags.boolean({ description: 'Apply without asking for confirmation' }),
    describe: Flags.string({
      description:
        'What you use, in your own words; sent to the catalog search, cut to 100 characters',
      helpValue: '<text>',
    }),
    'dry-run': Flags.boolean({ description: 'Print the candidate components and write nothing' }),
    format: Flags.string({
      description: 'Output format; agent and piped runs default to json',
      options: ['json', 'jsonl', 'table', 'plain'],
    }),
    json: Flags.boolean({ description: 'Shorthand for --format json' }),
    provider: Flags.string({
      description: 'Provider name as the dashboard spells it, or its id',
      helpValue: '<name|id>',
    }),
    region: Flags.string({ description: 'Only components in this region', helpValue: '<code>' }),
    search: Flags.string({
      description: 'Search the components for this text instead of the description',
      helpValue: '<text>',
    }),
  };
  static override summary = 'Find the components of a provider your stack uses and monitor them';

  async run(): Promise<void> {
    const { flags } = await this.parse(ScanThirdParty);
    if (flags.json === true && flags.format !== undefined) {
      return this.fail(
        { code: 'INVALID_INPUT', message: '--json cannot be combined with --format.' },
        2,
      );
    }
    const mode = detectInvocationMode(false);
    const format = resolveFormat(flags, mode);
    const search = flags.search?.trim() || undefined;
    const region = flags.region?.trim() || undefined;
    const description = await this.resolveDescription({
      describe: flags.describe,
      mode,
      provider: flags.provider,
      region,
      search,
    });
    const api = await this.connect({ apiKey: flags['api-key'], mode });

    const provider = await this.findProvider(api, { description, name: flags.provider });
    const monitor = await this.findMonitor(api, provider.id);
    const found = await this.findComponents(api, { description, provider, region, search });
    const scan: Scan = {
      candidates: found.map((leaf) => ({
        ...leaf,
        tracked:
          monitor !== undefined &&
          (monitor.scope === 'all' || monitor.trackedComponentIds.includes(leaf.id)),
      })),
      monitor,
      provider,
    };

    this.printList(format, scan);
    if (flags['dry-run'] === true) return this.printResult(format, scan);
    if (scan.candidates.length === 0) {
      return this.notFound(
        'No components matched. Use the full service names the status page uses, for example Simple Storage Service, not S3.',
      );
    }
    if (flags.confirm !== true && !(await this.confirmed({ api, format, mode, scan }))) return;

    const monitorId = await this.apply(api, scan);
    if (isJson(format)) return this.printResult(format, scan, monitorId);
    this.log(`Monitor ${monitorId}: ${DASHBOARD_URL}/${monitorId}`);
  }

  private notFound(message: string): never {
    return this.fail({ code: 'NOT_FOUND', message }, 1);
  }

  private async resolveDescription(input: {
    describe: string | undefined;
    mode: InvocationMode;
    provider: string | undefined;
    region: string | undefined;
    search: string | undefined;
  }): Promise<string | undefined> {
    const described = clip(input.describe ?? '');
    if (described) return described;
    if (input.provider === undefined) {
      return this.fail(
        { code: 'INVALID_INPUT', message: 'Pass --provider, or --describe naming the provider.' },
        2,
      );
    }
    if (input.search !== undefined || input.region !== undefined) return undefined;
    const hint = descriptionHint(input.provider);
    const answer = confirmationAvailable(input.mode) ? await askDescription(`${hint} `) : '';
    if (answer) return answer;
    return this.fail({ code: 'INVALID_INPUT', message: `${hint} Pass it with --describe.` }, 2);
  }

  private async connect(input: { apiKey: string | undefined; mode: InvocationMode }): Promise<Api> {
    const apiUrl = new URL(process.env.UPTIMEROBOT_DEV_API_URL ?? PRODUCTION_API_URL);
    const client = await authenticatedClient({
      apiKey: input.apiKey,
      apiUrl,
      command: COMMAND,
      mode: input.mode,
      version: this.config.pjson.version,
    });
    return { apiUrl, send: sender(client) };
  }

  private async read(api: Api, path: string, query?: Record<string, string>): Promise<unknown> {
    return requireOk(await api.send('GET', buildUrl(api.apiUrl, path, query)));
  }

  private async findProvider(
    api: Api,
    input: { description: string | undefined; name: string | undefined },
  ): Promise<Provider> {
    const { name } = input;
    if (name === undefined) return this.providerNamedIn(api, input.description ?? '');
    if (/^\d+$/.test(name)) return this.providerById(api, name);
    const rows = rowsOf(await this.read(api, '/third-party-providers', { search: name }));
    const match = rows
      .flatMap((row) => asProvider(row) ?? [])
      .find((row) => row.name.toLowerCase() === name.toLowerCase());
    return (
      match ??
      this.notFound(
        `No provider named "${name}". Try the exact name from the dashboard, or its id.`,
      )
    );
  }

  private async providerById(api: Api, id: string): Promise<Provider> {
    const result = await api.send('GET', buildUrl(api.apiUrl, `/third-party-providers/${id}`));
    if (result.response.status === 404) return this.notFound(`No provider with id ${id}.`);
    return asProvider(requireOk(result)) ?? this.notFound(`No provider with id ${id}.`);
  }

  private async providerNamedIn(api: Api, description: string): Promise<Provider> {
    const rows = rowsOf(await this.read(api, '/third-party-providers', { search: description }));
    const named = rows
      .flatMap((row) => asProvider(row) ?? [])
      .filter((row) => occursAsWords(row.name, description))
      .toSorted((left, right) => right.name.length - left.name.length)
      .at(0);
    return (
      named ??
      this.notFound(
        `No provider named in "${description}". Pass --provider with the exact name from the dashboard, or its id.`,
      )
    );
  }

  private async findMonitor(api: Api, providerId: number): Promise<Monitor | undefined> {
    const searchPage = async (url: URL): Promise<Monitor | undefined> => {
      const page = requireOk(await api.send('GET', url));
      const found = rowsOf(page)
        .flatMap((row) => asMonitor(row, providerId) ?? [])
        .at(0);
      const nextLink = field(page, 'nextLink');
      if (found || typeof nextLink !== 'string') return found;
      return searchPage(new URL(nextLink, api.apiUrl));
    };
    return searchPage(buildUrl(api.apiUrl, '/monitors', { limit: MONITOR_PAGE_SIZE }));
  }

  private async findComponents(
    api: Api,
    input: {
      description: string | undefined;
      provider: Provider;
      region: string | undefined;
      search: string | undefined;
    },
  ): Promise<Found[]> {
    const { description, provider, region, search } = input;
    const fetchWord = async (word: string): Promise<WordResult> => {
      const payload = await this.read(api, `/third-party-providers/${provider.id}/components`, {
        search: word,
        ...(region === undefined ? {} : { region }),
      });
      return {
        leaves: leavesIn(rowsOf(payload)),
        regionLike: field(payload, 'regionLike') === true,
        word,
      };
    };
    const everyLeaf = async (word: string, matchedBy: string): Promise<Found[]> =>
      (await fetchWord(word)).leaves.map((leaf) => ({ ...leaf, matchedBy }));

    if (search !== undefined) return everyLeaf(search, search);
    const terms = searchTerms(description ?? '', provider.name);
    if (terms.length > 0) {
      const results = await terms.reduce(
        async (previous, term) => [...(await previous), await fetchWord(term)],
        Promise.resolve<WordResult[]>([]),
      );
      return narrowByRegions(results);
    }
    if (region !== undefined) return everyLeaf('', region);
    return this.fail(
      {
        code: 'INVALID_INPUT',
        message: `${descriptionHint(provider.name)} Pass it with --describe.`,
      },
      2,
    );
  }

  private printList(format: OutputFormat, scan: Scan): void {
    if (isJson(format)) return;
    const alreadyTracked = scan.candidates.filter((candidate) => candidate.tracked).length;
    this.log(
      `Found ${scan.candidates.length} components on ${scan.provider.name} (${alreadyTracked} already monitored)`,
    );
    const table = formatOutput(format, scan.candidates, { columns: SCAN_THIRD_PARTY_COLUMNS });
    if (table !== undefined) this.log(table);
  }

  private printResult(format: OutputFormat, scan: Scan, appliedMonitorId?: number): void {
    if (!isJson(format)) return;
    const { candidates, monitor, provider } = scan;
    const scope = appliedMonitorId === undefined ? monitor?.scope : 'list';
    const id = appliedMonitorId ?? monitor?.id;
    this.log(
      JSON.stringify({
        applied: appliedMonitorId !== undefined,
        provider,
        monitor: id === undefined || scope === undefined ? null : { id, scope },
        candidates,
      }),
    );
  }

  private async confirmed(input: {
    api: Api;
    format: OutputFormat;
    mode: InvocationMode;
    scan: Scan;
  }): Promise<boolean> {
    const { api, format, mode, scan } = input;
    if (!confirmationAvailable(mode)) {
      this.printResult(format, scan);
      return this.fail(
        { code: 'CONFIRMATION_REQUIRED', message: 'Re-run with --confirm to apply' },
        2,
      );
    }
    if (await requestConfirmation(await this.confirmationQuestion(api, scan), mode)) return true;
    this.printResult(format, scan);
    this.logToStderr('Cancelled. Nothing was changed.');
    return false;
  }

  private async confirmationQuestion(api: Api, scan: Scan): Promise<string> {
    const { candidates, monitor, provider } = scan;
    const count = candidates.length;
    if (!monitor) return `Create an ${provider.name} monitor with these ${count} components?`;
    if (monitor.scope === 'list') {
      const alreadyTracked = candidates.filter((candidate) => candidate.tracked).length;
      return `Add ${count} components to monitor ${monitor.id} (${alreadyTracked} already tracked)?`;
    }
    const detail = await this.read(api, `/third-party-providers/${provider.id}`);
    const components = field(detail, 'components');
    const total = leavesIn(Array.isArray(components) ? components : []).length;
    return `Replace all ${total} components of monitor ${monitor.id} with these ${count}?`;
  }

  private async apply(api: Api, scan: Scan): Promise<number> {
    const { monitor, provider } = scan;
    const ids = scan.candidates.map((candidate) => candidate.id);
    if (!monitor) {
      const created = requireOk(
        await api.send('POST', buildUrl(api.apiUrl, '/monitors'), {
          config: { thirdPartyService: { providerId: provider.id, trackedComponentIds: ids } },
          type: 'THIRD_PARTY_SERVICE',
        }),
      );
      const id = field(created, 'id');
      if (typeof id === 'number') return id;
      return this.fail(
        { code: 'UNEXPECTED_RESPONSE', message: 'The API did not return the new monitor id.' },
        1,
      );
    }
    const trackedComponentIds =
      monitor.scope === 'list' ? [...new Set([...monitor.trackedComponentIds, ...ids])] : ids;
    requireOk(
      await api.send('PATCH', buildUrl(api.apiUrl, `/monitors/${monitor.id}`), {
        config: { thirdPartyService: { trackedComponentIds } },
      }),
    );
    return monitor.id;
  }
}
