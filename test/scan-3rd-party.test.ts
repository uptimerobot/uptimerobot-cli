import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  asMonitor,
  type Leaf,
  leavesIn,
  narrowByRegions,
  occursAsWords,
  searchTerms,
  searchWords,
  taggedBy,
  type WordResult,
} from '../src/lib/third-party-scan.js';
import { runCli } from './helpers/run-cli.js';
import { runInteractiveCli } from './helpers/run-interactive-cli.js';

interface Region {
  code: string;
  name: string;
}

interface Component {
  global: boolean;
  id: number;
  name: string;
  region: Region | null;
  status: string;
}

interface ComponentGroup extends Component {
  children: Component[];
}

interface ComponentsResponse {
  data: ComponentGroup[];
  regionLike: boolean;
}

interface ProviderRow {
  id: number;
  name: string;
}

interface ProviderDetail {
  components: {
    children: { id: number; name: string; status: string }[];
    id: number;
    name: string;
    status: string;
  }[];
  id: number;
  name: string;
}

interface MonitorRow {
  config?: { thirdPartyService: { providerId: number; trackedComponentIds: number[] | null } };
  id: number;
  type: string;
}

interface Scenario {
  componentResponses: Record<string, ComponentsResponse>;
  createdMonitorId: number;
  monitorPages: MonitorRow[][];
  providerDetails: Record<number, ProviderDetail>;
  providerSearchRows: ProviderRow[];
  writeFailure?: { body: unknown; status: number };
}

interface RecordedRequest {
  body: unknown;
  headers: IncomingHttpHeaders;
  method: string;
  path: string;
  query: Record<string, string>;
}

interface FakeApi {
  requests: RecordedRequest[];
  url: string;
}

const OREGON: Region = { code: 'us-west-2', name: 'Oregon' };
const IRELAND: Region = { code: 'eu-west-1', name: 'Ireland' };

const getMockLeaf = (
  overrides: Pick<Component, 'id' | 'name'> & Partial<Component>,
): Component => ({
  global: false,
  region: null,
  status: 'operational',
  ...overrides,
});

const getMockGroup = (id: number, name: string, children: Component[]): ComponentGroup => ({
  ...getMockLeaf({ id, name }),
  children,
});

const asRootLeaf = (leaf: Component): ComponentGroup => ({ ...leaf, children: [] });

const LAMBDA_OREGON = getMockLeaf({ id: 1001, name: 'AWS Lambda (Oregon)', region: OREGON });
const LAMBDA_IRELAND = getMockLeaf({ id: 1002, name: 'AWS Lambda (Ireland)', region: IRELAND });
const DYNAMODB_OREGON = getMockLeaf({ id: 2001, name: 'Amazon DynamoDB (Oregon)', region: OREGON });
const DYNAMODB_IRELAND = getMockLeaf({
  id: 2002,
  name: 'Amazon DynamoDB (Ireland)',
  region: IRELAND,
});
const S3_OREGON = getMockLeaf({
  id: 3001,
  name: 'Amazon Simple Storage Service (Oregon)',
  region: OREGON,
});
const S3_IRELAND = getMockLeaf({
  id: 3002,
  name: 'Amazon Simple Storage Service (Ireland)',
  region: IRELAND,
});
const CONSOLE_OREGON = getMockLeaf({
  id: 4000,
  name: 'AWS Management Console (Oregon)',
  region: OREGON,
});
const REPOSITORY_OREGON = getMockLeaf({
  id: 1003,
  name: 'AWS Serverless Application Repository (Oregon)',
  region: OREGON,
});

const getMockAwsComponentResponses = (): Record<string, ComponentsResponse> => ({
  dynamodb: {
    data: [getMockGroup(2000, 'Amazon DynamoDB', [DYNAMODB_OREGON, DYNAMODB_IRELAND])],
    regionLike: false,
  },
  lambda: {
    data: [getMockGroup(1000, 'AWS Lambda', [LAMBDA_OREGON, LAMBDA_IRELAND])],
    regionLike: false,
  },
  oregon: {
    data: [
      getMockGroup(1000, 'AWS Lambda', [LAMBDA_OREGON]),
      getMockGroup(2000, 'Amazon DynamoDB', [DYNAMODB_OREGON]),
      getMockGroup(3000, 'Amazon Simple Storage Service', [S3_OREGON]),
    ],
    regionLike: true,
  },
  s3: {
    data: [getMockGroup(3000, 'Amazon Simple Storage Service', [S3_OREGON, S3_IRELAND])],
    regionLike: false,
  },
});

const IOWA: Region = { code: 'us-central1', name: 'Iowa' };
const BELGIUM: Region = { code: 'europe-west1', name: 'Belgium' };
const CLOUD_RUN_IOWA = getMockLeaf({ id: 5001, name: 'Cloud Run (us-central1)', region: IOWA });
const CLOUD_RUN_BELGIUM = getMockLeaf({
  id: 5002,
  name: 'Cloud Run (europe-west1)',
  region: BELGIUM,
});
const CLOUD_STORAGE_IOWA = getMockLeaf({
  id: 5101,
  name: 'Cloud Storage (us-central1)',
  region: IOWA,
});

const getMockGoogleCloudComponentResponses = (): Record<string, ComponentsResponse> => ({
  cloud: {
    data: [
      getMockGroup(5000, 'Cloud Run', [CLOUD_RUN_IOWA, CLOUD_RUN_BELGIUM]),
      getMockGroup(5100, 'Cloud Storage', [CLOUD_STORAGE_IOWA]),
    ],
    regionLike: false,
  },
  'cloud run': {
    data: [getMockGroup(5000, 'Cloud Run', [CLOUD_RUN_IOWA, CLOUD_RUN_BELGIUM])],
    regionLike: false,
  },
});

const getMockAwsDetail = (): ProviderDetail => ({
  components: [
    getMockGroup(1000, 'AWS Lambda', [LAMBDA_OREGON, LAMBDA_IRELAND]),
    getMockGroup(2000, 'Amazon DynamoDB', [DYNAMODB_OREGON, DYNAMODB_IRELAND]),
    asRootLeaf(CONSOLE_OREGON),
  ].map(({ children, id, name, status }) => ({
    children: children.map((child) => ({ id: child.id, name: child.name, status: child.status })),
    id,
    name,
    status,
  })),
  id: 248,
  name: 'AWS',
});

const getMockScenario = (overrides: Partial<Scenario> = {}): Scenario => ({
  componentResponses: getMockAwsComponentResponses(),
  createdMonitorId: 555,
  monitorPages: [[]],
  providerDetails: { 248: getMockAwsDetail() },
  providerSearchRows: [{ id: 248, name: 'AWS' }],
  ...overrides,
});

const getMockThirdPartyMonitor = (
  overrides: Partial<{ id: number; providerId: number; trackedComponentIds: number[] | null }> = {},
): MonitorRow => {
  const { id = 7, providerId = 248, trackedComponentIds = null } = overrides;
  return {
    config: { thirdPartyService: { providerId, trackedComponentIds } },
    id,
    type: 'THIRD_PARTY_SERVICE',
  };
};

const HTTP_MONITOR: MonitorRow = { id: 3, type: 'HTTP' };

const candidate = (
  leaf: Component,
  parentName: string | null,
  matchedBy: string,
  tracked = false,
) => ({
  id: leaf.id,
  matchedBy,
  name: leaf.name,
  parentName,
  region: leaf.region,
  tracked,
});

const NOT_FOUND = { body: { code: '000-004', message: 'Not found' }, status: 404 };

const answer = (
  scenario: Scenario,
  method: string,
  url: URL,
): { body: unknown; status: number } => {
  const { pathname, searchParams } = url;
  if (method === 'GET' && pathname === '/v3/third-party-providers') {
    return {
      body: {
        data: scenario.providerSearchRows.map((row) => ({
          ...row,
          isTracked: false,
          logoUrl: null,
          matchedComponent: null,
          state: 'operational',
          statusPageUrl: `https://status.example.com/${row.id}`,
        })),
      },
      status: 200,
    };
  }
  if (method === 'GET' && /^\/v3\/third-party-providers\/\d+\/components$/.test(pathname)) {
    return {
      body: scenario.componentResponses[searchParams.get('search') ?? ''] ?? {
        data: [],
        regionLike: false,
      },
      status: 200,
    };
  }
  const detail = /^\/v3\/third-party-providers\/(\d+)$/.exec(pathname);
  if (method === 'GET' && detail) {
    const provider = scenario.providerDetails[Number(detail[1])];
    return provider ? { body: provider, status: 200 } : NOT_FOUND;
  }
  if (method === 'GET' && pathname === '/v3/monitors') {
    const page = Number(searchParams.get('cursor') ?? 0);
    const hasNextPage = page + 1 < scenario.monitorPages.length;
    return {
      body: {
        data: scenario.monitorPages[page] ?? [],
        nextLink: hasNextPage ? `${url.origin}/v3/monitors?limit=200&cursor=${page + 1}` : null,
      },
      status: 200,
    };
  }
  if (method === 'POST' && pathname === '/v3/monitors') {
    return (
      scenario.writeFailure ?? {
        body: { id: scenario.createdMonitorId, type: 'THIRD_PARTY_SERVICE' },
        status: 201,
      }
    );
  }
  const monitor = /^\/v3\/monitors\/(\d+)$/.exec(pathname);
  if (method === 'PATCH' && monitor) {
    return (
      scenario.writeFailure ?? {
        body: { id: Number(monitor[1]), type: 'THIRD_PARTY_SERVICE' },
        status: 200,
      }
    );
  }
  return NOT_FOUND;
};

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

const startFakeApi = async (overrides: Partial<Scenario> = {}): Promise<FakeApi> => {
  const scenario = getMockScenario(overrides);
  const requests: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const method = request.method ?? 'GET';
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      requests.push({
        body: raw === '' ? undefined : JSON.parse(raw),
        headers: request.headers,
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
      });
      const reply = answer(scenario, method, url);
      response.statusCode = reply.status;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  servers.push(server);
  return { requests, url: `http://127.0.0.1:${address.port}` };
};

const startGoogleCloudApi = (): Promise<FakeApi> =>
  startFakeApi({
    componentResponses: getMockGoogleCloudComponentResponses(),
    providerDetails: {},
    providerSearchRows: [{ id: 344, name: 'Google Cloud' }],
  });

const cliEnv = (api: FakeApi): Record<string, string> => ({
  UPTIMEROBOT_AGENT: '0',
  UPTIMEROBOT_API_KEY: 'u123-secret',
  UPTIMEROBOT_DEV_API_URL: `${api.url}/v3`,
});

const scan = (api: FakeApi, args: string[], env: Record<string, string | undefined> = {}) =>
  runCli(['scan', '3rd-party', ...args], { ...cliEnv(api), ...env });

const scanInTerminal = (
  api: FakeApi,
  args: string[],
  interactions: Parameters<typeof runInteractiveCli>[1],
) => runInteractiveCli(['scan', '3rd-party', ...args], interactions, cliEnv(api));

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const errorOf = (stderr: string): unknown => {
  const envelope = parseJson(stderr.trim().split('\n').at(-1) ?? '') as { error?: unknown } | null;
  return typeof envelope === 'object' && envelope !== null ? envelope.error : stderr;
};

const componentRequests = (api: FakeApi) =>
  api.requests.filter(
    (request) => request.method === 'GET' && request.path.endsWith('/components'),
  );

const componentSearches = (api: FakeApi) =>
  componentRequests(api).map((request) => request.query.search);

const providerSearches = (api: FakeApi) =>
  api.requests
    .filter((request) => request.method === 'GET' && request.path === '/v3/third-party-providers')
    .map((request) => request.query.search);

const writesOf = (api: FakeApi) =>
  api.requests
    .filter((request) => request.method === 'POST' || request.method === 'PATCH')
    .map(({ body, method, path }) => ({ body, method, path }));

const routesOf = (api: FakeApi) =>
  api.requests.map((request) => `${request.method} ${request.path}`);

const DASHBOARD_URL = 'https://dashboard.uptimerobot.com/3rd-party-services';

describe('scan 3rd-party: finding the components of a described stack', () => {
  it('lists the Oregon Lambda and DynamoDB components for a dry run and writes nothing', async () => {
    const api = await startFakeApi();

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'Lambda and DynamoDB in Oregon',
      '--dry-run',
      '--json',
    ]);

    expect({
      exitCode: result.exitCode,
      output: parseJson(result.stdout),
      writes: writesOf(api),
    }).toEqual({
      exitCode: 0,
      output: {
        applied: false,
        candidates: [
          candidate(LAMBDA_OREGON, 'AWS Lambda', 'lambda'),
          candidate(DYNAMODB_OREGON, 'Amazon DynamoDB', 'dynamodb'),
        ],
        monitor: null,
        provider: { id: 248, name: 'AWS' },
      },
      writes: [],
    });
  });

  it('searches the catalog once per meaningful word, in description order', async () => {
    const api = await startFakeApi();

    await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'AWS Lambda and DynamoDB in Oregon with S3 and x',
      '--dry-run',
      '--json',
    ]);

    expect(componentSearches(api)).toEqual(['lambda', 'dynamodb', 'oregon', 's3']);
  });

  it('cuts a long description to 100 characters after trimming, before any request', async () => {
    const api = await startFakeApi({
      providerDetails: {},
      providerSearchRows: [{ id: 6, name: 'Cloudflare' }],
    });
    const longDescription = `   cloudflare ${'w'.repeat(150)}  `;

    await scan(api, ['--describe', longDescription, '--dry-run', '--json']);

    expect({
      componentSearches: componentSearches(api),
      providerSearches: providerSearches(api),
    }).toEqual({
      componentSearches: ['w'.repeat(89)],
      providerSearches: [`cloudflare ${'w'.repeat(89)}`],
    });
  });

  it('passes --region with every word it searches for', async () => {
    const api = await startFakeApi({
      componentResponses: {
        dynamodb: {
          data: [getMockGroup(2000, 'Amazon DynamoDB', [DYNAMODB_OREGON])],
          regionLike: true,
        },
        lambda: { data: [getMockGroup(1000, 'AWS Lambda', [LAMBDA_OREGON])], regionLike: true },
      },
    });

    await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'lambda dynamodb',
      '--region',
      'us-west-2',
      '--dry-run',
      '--json',
    ]);

    expect(componentRequests(api).map((request) => request.query)).toEqual([
      { region: 'us-west-2', search: 'lambda' },
      { region: 'us-west-2', search: 'dynamodb' },
    ]);
  });

  it('makes one search for --search with --region and credits every candidate to that text', async () => {
    const api = await startFakeApi({
      componentResponses: {
        lambda: {
          data: [getMockGroup(1000, 'AWS Lambda', [LAMBDA_OREGON]), asRootLeaf(CONSOLE_OREGON)],
          regionLike: true,
        },
      },
    });

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--search',
      'lambda',
      '--region',
      'us-west-2',
      '--dry-run',
      '--json',
    ]);

    expect({
      exitCode: result.exitCode,
      output: parseJson(result.stdout),
      requests: componentRequests(api).map((request) => request.query),
    }).toMatchObject({
      exitCode: 0,
      output: {
        candidates: [
          candidate(LAMBDA_OREGON, 'AWS Lambda', 'lambda'),
          candidate(CONSOLE_OREGON, null, 'lambda'),
        ],
      },
      requests: [{ region: 'us-west-2', search: 'lambda' }],
    });
  });

  it('offers every component of the region when the description names only a region', async () => {
    const api = await startFakeApi();

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'oregon',
      '--dry-run',
      '--json',
    ]);

    expect({ exitCode: result.exitCode, output: parseJson(result.stdout) }).toMatchObject({
      exitCode: 0,
      output: {
        candidates: [
          candidate(LAMBDA_OREGON, 'AWS Lambda', 'oregon'),
          candidate(DYNAMODB_OREGON, 'Amazon DynamoDB', 'oregon'),
          candidate(S3_OREGON, 'Amazon Simple Storage Service', 'oregon'),
        ],
      },
    });
  });

  it('merges the components of several words without listing one twice', async () => {
    const api = await startFakeApi({
      componentResponses: {
        lambda: {
          data: [getMockGroup(1000, 'AWS Lambda', [LAMBDA_OREGON, LAMBDA_IRELAND])],
          regionLike: false,
        },
        serverless: {
          data: [
            getMockGroup(1000, 'AWS Lambda', [LAMBDA_IRELAND]),
            getMockGroup(1100, 'AWS Serverless Application Repository', [REPOSITORY_OREGON]),
          ],
          regionLike: false,
        },
      },
    });

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'lambda serverless',
      '--dry-run',
      '--json',
    ]);

    expect({ exitCode: result.exitCode, output: parseJson(result.stdout) }).toMatchObject({
      exitCode: 0,
      output: {
        candidates: [
          candidate(LAMBDA_OREGON, 'AWS Lambda', 'lambda'),
          candidate(LAMBDA_IRELAND, 'AWS Lambda', 'lambda'),
          candidate(REPOSITORY_OREGON, 'AWS Serverless Application Repository', 'serverless'),
        ],
      },
    });
  });

  it('exits 0 with an empty candidate list for a dry run that matches nothing', async () => {
    const api = await startFakeApi();

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'nothing matches here',
      '--dry-run',
      '--json',
    ]);

    expect({
      exitCode: result.exitCode,
      output: parseJson(result.stdout),
      writes: writesOf(api),
    }).toMatchObject({ exitCode: 0, output: { applied: false, candidates: [] }, writes: [] });
  });

  it('refuses to apply when nothing matched, never sending an empty component list', async () => {
    const api = await startFakeApi();

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'nothing matches here',
      '--confirm',
    ]);

    expect({
      error: errorOf(result.stderr),
      exitCode: result.exitCode,
      writes: writesOf(api),
    }).toMatchObject({ error: { code: 'NOT_FOUND' }, exitCode: 1, writes: [] });
  });

  it('searches the whole description once when it names the provider and every other word is a stop-word', async () => {
    const api = await startGoogleCloudApi();

    const result = await scan(api, [
      '--provider',
      'Google Cloud',
      '--describe',
      'cloud run',
      '--dry-run',
      '--json',
    ]);

    expect({
      componentRequests: componentRequests(api).map(({ path, query }) => ({ path, query })),
      exitCode: result.exitCode,
      output: parseJson(result.stdout),
    }).toEqual({
      componentRequests: [
        { path: '/v3/third-party-providers/344/components', query: { search: 'cloud run' } },
      ],
      exitCode: 0,
      output: {
        applied: false,
        candidates: [
          candidate(CLOUD_RUN_IOWA, 'Cloud Run', 'cloud run'),
          candidate(CLOUD_RUN_BELGIUM, 'Cloud Run', 'cloud run'),
        ],
        monitor: null,
        provider: { id: 344, name: 'Google Cloud' },
      },
    });
  });
});

describe('scan 3rd-party: choosing the provider', () => {
  it('picks the provider whose name equals --provider ignoring case, even when it is not the first row', async () => {
    const api = await startFakeApi({
      providerSearchRows: [
        { id: 249, name: 'AWS Amplify' },
        { id: 248, name: 'AWS' },
      ],
    });

    const result = await scan(api, [
      '--provider',
      'aws',
      '--describe',
      'lambda',
      '--dry-run',
      '--json',
    ]);

    expect({
      componentPaths: componentRequests(api).map((request) => request.path),
      exitCode: result.exitCode,
      output: parseJson(result.stdout),
      providerSearches: providerSearches(api),
    }).toMatchObject({
      componentPaths: ['/v3/third-party-providers/248/components'],
      exitCode: 0,
      output: { provider: { id: 248, name: 'AWS' } },
      providerSearches: ['aws'],
    });
  });

  it('exits 1 naming the provider when no search row has exactly that name, without looking at components', async () => {
    const api = await startFakeApi({
      providerSearchRows: [
        { id: 249, name: 'AWS Amplify' },
        { id: 11, name: 'Amazon' },
      ],
    });

    const result = await scan(api, ['--provider', 'aws', '--describe', 'lambda', '--dry-run']);

    expect({
      componentRequests: componentRequests(api),
      error: errorOf(result.stderr),
      exitCode: result.exitCode,
    }).toMatchObject({
      componentRequests: [],
      error: {
        code: 'NOT_FOUND',
        message: 'No provider named "aws". Try the exact name from the dashboard, or its id.',
      },
      exitCode: 1,
    });
  });

  it('exits 1 and creates nothing for an unknown provider even when the description has no usable word', async () => {
    const api = await startFakeApi();

    const result = await scan(api, ['--provider', 'nope', '--describe', 'x', '--confirm']);

    expect({
      error: errorOf(result.stderr),
      exitCode: result.exitCode,
      writes: writesOf(api),
    }).toMatchObject({ error: { code: 'NOT_FOUND' }, exitCode: 1, writes: [] });
  });

  it('looks a numeric --provider up by id and never searches the catalog', async () => {
    const api = await startFakeApi();

    const result = await scan(api, [
      '--provider',
      '248',
      '--describe',
      'lambda',
      '--dry-run',
      '--json',
    ]);

    expect({
      exitCode: result.exitCode,
      output: parseJson(result.stdout),
      providerSearches: providerSearches(api),
      routes: routesOf(api),
    }).toMatchObject({
      exitCode: 0,
      output: { provider: { id: 248, name: 'AWS' } },
      providerSearches: [],
      routes: expect.arrayContaining(['GET /v3/third-party-providers/248']),
    });
  });

  it('exits 1 with NOT_FOUND when the provider id does not exist', async () => {
    const api = await startFakeApi();

    const result = await scan(api, ['--provider', '999', '--describe', 'lambda', '--confirm']);

    expect({
      error: errorOf(result.stderr),
      exitCode: result.exitCode,
      writes: writesOf(api),
    }).toMatchObject({ error: { code: 'NOT_FOUND' }, exitCode: 1, writes: [] });
  });

  it('finds the provider named in the description with one search of the whole description', async () => {
    const api = await startFakeApi({
      componentResponses: {
        workers: {
          data: [
            asRootLeaf(getMockLeaf({ id: 601, name: 'Workers' })),
            asRootLeaf(getMockLeaf({ id: 602, name: 'Workers KV' })),
          ],
          regionLike: false,
        },
      },
      providerSearchRows: [
        { id: 9, name: 'Workers Platform' },
        { id: 6, name: 'Cloudflare' },
      ],
    });

    const result = await scan(api, [
      '--describe',
      'free workers on cloudflare',
      '--dry-run',
      '--json',
    ]);

    expect({
      componentPaths: [...new Set(componentRequests(api).map((request) => request.path))],
      componentSearches: componentSearches(api),
      exitCode: result.exitCode,
      output: parseJson(result.stdout),
      providerSearches: providerSearches(api),
    }).toMatchObject({
      componentPaths: ['/v3/third-party-providers/6/components'],
      componentSearches: ['free', 'workers'],
      exitCode: 0,
      output: {
        candidates: [
          candidate(getMockLeaf({ id: 601, name: 'Workers' }), null, 'workers'),
          candidate(getMockLeaf({ id: 602, name: 'Workers KV' }), null, 'workers'),
        ],
        provider: { id: 6, name: 'Cloudflare' },
      },
      providerSearches: ['free workers on cloudflare'],
    });
  });

  it('prefers the longest provider name that occurs in the description', async () => {
    const api = await startFakeApi({
      providerSearchRows: [
        { id: 6, name: 'Cloudflare' },
        { id: 61, name: 'Cloudflare Workers' },
      ],
    });

    const result = await scan(api, [
      '--describe',
      'free cloudflare workers',
      '--dry-run',
      '--json',
    ]);

    expect({ exitCode: result.exitCode, output: parseJson(result.stdout) }).toMatchObject({
      exitCode: 0,
      output: { provider: { id: 61, name: 'Cloudflare Workers' } },
    });
  });

  it('asks for --provider when no provider name occurs in the description', async () => {
    const api = await startFakeApi({ providerSearchRows: [{ id: 6, name: 'Cloudflare' }] });

    const result = await scan(api, ['--describe', 'free something', '--dry-run', '--json']);

    expect({
      componentRequests: componentRequests(api),
      error: errorOf(result.stderr),
      exitCode: result.exitCode,
    }).toMatchObject({
      componentRequests: [],
      error: { message: expect.stringContaining('--provider') },
      exitCode: 1,
    });
  });

  it('does not take a provider name that only occurs inside a longer word', async () => {
    const api = await startFakeApi({ providerSearchRows: [{ id: 6, name: 'Cloudflare' }] });

    const result = await scan(api, [
      '--describe',
      'free cloudflared tunnels',
      '--dry-run',
      '--json',
    ]);

    expect({ error: errorOf(result.stderr), exitCode: result.exitCode }).toMatchObject({
      error: { message: expect.stringContaining('--provider') },
      exitCode: 1,
    });
  });
});

describe('scan 3rd-party: asking what the user runs', () => {
  it('exits 2 with the question as a hint, and makes no request, when nothing can be asked', async () => {
    const api = await startFakeApi();

    const result = await scan(api, ['--provider', 'AWS']);

    expect({
      exitCode: result.exitCode,
      hint: result.stderr.includes(
        'What do you use on AWS? (for example: Lambda and DynamoDB in Oregon)',
      ),
      requests: api.requests,
    }).toEqual({ exitCode: 2, hint: true, requests: [] });
  });

  it.each([
    { description: 'Google Cloud', says: 'only the provider name' },
    { description: 'x', says: 'a single character' },
  ])(
    'exits 2 with the question as a hint, and no components request, when the description is $says',
    async ({ description }) => {
      const api = await startGoogleCloudApi();

      const result = await scan(api, ['--provider', 'Google Cloud', '--describe', description]);

      expect({
        componentRequests: componentRequests(api),
        exitCode: result.exitCode,
        hint: result.stderr.includes('What do you use on Google Cloud?'),
      }).toEqual({ componentRequests: [], exitCode: 2, hint: true });
    },
  );

  it.runIf(process.platform === 'darwin' || process.platform === 'linux')(
    'asks once in a terminal and searches with the typed answer',
    async () => {
      const api = await startFakeApi();
      const question = 'What do you use on AWS? (for example: Lambda and DynamoDB in Oregon)';

      const result = await scanInTerminal(
        api,
        ['--provider', 'AWS', '--dry-run', '--json'],
        [{ input: 'Lambda in Oregon\n', waitFor: question }],
      );

      expect({
        componentSearches: componentSearches(api),
        exitCode: result.exitCode,
        timesAsked: result.output.split('What do you use on AWS?').length - 1,
      }).toEqual({ componentSearches: ['lambda', 'oregon'], exitCode: 0, timesAsked: 1 });
    },
  );
});

describe('scan 3rd-party: showing what was found', () => {
  it('prints a summary line and a table of the components in human output', async () => {
    const api = await startFakeApi({
      monitorPages: [[getMockThirdPartyMonitor({ trackedComponentIds: [1001] })]],
    });

    const result = await scan(
      api,
      [
        '--provider',
        'AWS',
        '--describe',
        'Lambda and DynamoDB in Oregon',
        '--dry-run',
        '--format',
        'table',
      ],
      { FORCE_COLOR: undefined, NO_COLOR: '1' },
    );

    const lines = result.stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.trimEnd().split(/ {2,}/));
    expect({ exitCode: result.exitCode, lines }).toEqual({
      exitCode: 0,
      lines: [
        ['Found 2 components on AWS (1 already monitored)'],
        ['ID', 'COMPONENT', 'REGION', 'MATCHED', 'TRACKED'],
        ['1001', 'AWS Lambda › AWS Lambda (Oregon)', 'us-west-2', 'lambda', 'yes'],
        ['2001', 'Amazon DynamoDB › Amazon DynamoDB (Oregon)', 'us-west-2', 'dynamodb', 'no'],
      ],
    });
  });

  it.each([[null], [[]]])(
    'marks every candidate tracked when the provider monitor tracks every component (%j)',
    async (trackedComponentIds) => {
      const api = await startFakeApi({
        monitorPages: [[getMockThirdPartyMonitor({ id: 7, trackedComponentIds })]],
      });

      const result = await scan(api, [
        '--provider',
        'AWS',
        '--describe',
        'Lambda and DynamoDB in Oregon',
        '--dry-run',
        '--json',
      ]);

      expect({ exitCode: result.exitCode, output: parseJson(result.stdout) }).toEqual({
        exitCode: 0,
        output: {
          applied: false,
          candidates: [
            candidate(LAMBDA_OREGON, 'AWS Lambda', 'lambda', true),
            candidate(DYNAMODB_OREGON, 'Amazon DynamoDB', 'dynamodb', true),
          ],
          monitor: { id: 7, scope: 'all' },
          provider: { id: 248, name: 'AWS' },
        },
      });
    },
  );

  it('marks only the listed components tracked when the provider monitor has a component list', async () => {
    const api = await startFakeApi({
      monitorPages: [[getMockThirdPartyMonitor({ id: 7, trackedComponentIds: [2001] })]],
    });

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'Lambda and DynamoDB in Oregon',
      '--dry-run',
      '--json',
    ]);

    expect({ exitCode: result.exitCode, output: parseJson(result.stdout) }).toEqual({
      exitCode: 0,
      output: {
        applied: false,
        candidates: [
          candidate(LAMBDA_OREGON, 'AWS Lambda', 'lambda', false),
          candidate(DYNAMODB_OREGON, 'Amazon DynamoDB', 'dynamodb', true),
        ],
        monitor: { id: 7, scope: 'list' },
        provider: { id: 248, name: 'AWS' },
      },
    });
  });

  it('finds the provider monitor on a later page of the monitor list', async () => {
    const api = await startFakeApi({
      monitorPages: [
        [
          HTTP_MONITOR,
          getMockThirdPartyMonitor({ id: 5, providerId: 99, trackedComponentIds: [1] }),
        ],
        [getMockThirdPartyMonitor({ id: 7, trackedComponentIds: [2001] })],
      ],
    });

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'Lambda and DynamoDB in Oregon',
      '--dry-run',
      '--json',
    ]);

    expect({ exitCode: result.exitCode, output: parseJson(result.stdout) }).toMatchObject({
      exitCode: 0,
      output: {
        candidates: [
          { id: 1001, tracked: false },
          { id: 2001, tracked: true },
        ],
        monitor: { id: 7, scope: 'list' },
      },
    });
  });
});

describe('scan 3rd-party: applying without a terminal', () => {
  it('prints the candidates and exits 2 asking for --confirm when neither --confirm nor --dry-run is given', async () => {
    const api = await startFakeApi();

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'Lambda and DynamoDB in Oregon',
    ]);

    expect({
      error: errorOf(result.stderr),
      exitCode: result.exitCode,
      output: parseJson(result.stdout),
      writes: writesOf(api),
    }).toMatchObject({
      error: {
        code: 'CONFIRMATION_REQUIRED',
        message: expect.stringContaining('Re-run with --confirm to apply'),
      },
      exitCode: 2,
      output: {
        applied: false,
        candidates: [
          candidate(LAMBDA_OREGON, 'AWS Lambda', 'lambda'),
          candidate(DYNAMODB_OREGON, 'Amazon DynamoDB', 'dynamodb'),
        ],
      },
      writes: [],
    });
  });

  it('creates one third-party monitor with exactly the found components when --confirm is given', async () => {
    const api = await startFakeApi();

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'Lambda and DynamoDB in Oregon',
      '--confirm',
    ]);

    expect({
      exitCode: result.exitCode,
      output: parseJson(result.stdout),
      writes: writesOf(api),
    }).toMatchObject({
      exitCode: 0,
      output: { applied: true, monitor: { id: 555 }, provider: { id: 248, name: 'AWS' } },
      writes: [
        {
          body: {
            config: { thirdPartyService: { providerId: 248, trackedComponentIds: [1001, 2001] } },
            type: 'THIRD_PARTY_SERVICE',
          },
          method: 'POST',
          path: '/v3/monitors',
        },
      ],
    });
  });

  it('adds the new components to the monitor that already tracks a list, keeping the existing ones', async () => {
    const api = await startFakeApi({
      monitorPages: [[getMockThirdPartyMonitor({ id: 7, trackedComponentIds: [1001, 2001] })]],
    });

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'DynamoDB S3 Oregon',
      '--confirm',
    ]);

    expect({
      exitCode: result.exitCode,
      output: parseJson(result.stdout),
      writes: writesOf(api),
    }).toMatchObject({
      exitCode: 0,
      output: { applied: true, monitor: { id: 7 } },
      writes: [
        {
          body: { config: { thirdPartyService: { trackedComponentIds: [1001, 2001, 3001] } } },
          method: 'PATCH',
          path: '/v3/monitors/7',
        },
      ],
    });
  });

  it('replaces the all-components scope with exactly the found components instead of unioning', async () => {
    const api = await startFakeApi({
      monitorPages: [[getMockThirdPartyMonitor({ id: 7, trackedComponentIds: null })]],
    });

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'DynamoDB S3 Oregon',
      '--confirm',
    ]);

    expect({
      exitCode: result.exitCode,
      output: parseJson(result.stdout),
      writes: writesOf(api),
    }).toMatchObject({
      exitCode: 0,
      output: { applied: true, monitor: { id: 7 } },
      writes: [
        {
          body: { config: { thirdPartyService: { trackedComponentIds: [2001, 3001] } } },
          method: 'PATCH',
          path: '/v3/monitors/7',
        },
      ],
    });
  });
});

describe('scan 3rd-party: confirming in a terminal', () => {
  const inTerminal = it.runIf(process.platform === 'darwin' || process.platform === 'linux');

  inTerminal('asks to create a monitor and applies on yes', async () => {
    const api = await startFakeApi();
    const prompt = 'Create an AWS monitor with these 2 components? [y/N]';

    const result = await scanInTerminal(
      api,
      ['--provider', 'AWS', '--describe', 'Lambda and DynamoDB in Oregon'],
      [{ input: 'y\n', waitFor: prompt }],
    );

    expect({
      dashboardLinked: result.output.includes(`${DASHBOARD_URL}/555`),
      exitCode: result.exitCode,
      prompted: result.output.includes(prompt),
      writes: writesOf(api).map(({ method, path }) => `${method} ${path}`),
    }).toEqual({
      dashboardLinked: true,
      exitCode: 0,
      prompted: true,
      writes: ['POST /v3/monitors'],
    });
  });

  inTerminal('asks to add to the existing monitor and changes nothing on no', async () => {
    const api = await startFakeApi({
      monitorPages: [[getMockThirdPartyMonitor({ id: 7, trackedComponentIds: [1001] })]],
    });
    const prompt = 'Add 2 components to monitor 7 (1 already tracked)? [y/N]';

    const result = await scanInTerminal(
      api,
      ['--provider', 'AWS', '--describe', 'Lambda and DynamoDB in Oregon'],
      [{ input: 'n\n', waitFor: prompt }],
    );

    expect({
      exitCode: result.exitCode,
      prompted: result.output.includes(prompt),
      writes: writesOf(api),
    }).toEqual({ exitCode: 0, prompted: true, writes: [] });
  });

  inTerminal(
    'warns that an all-components monitor will be replaced, counting its leaves',
    async () => {
      const api = await startFakeApi({
        monitorPages: [[getMockThirdPartyMonitor({ id: 7, trackedComponentIds: null })]],
      });
      const prompt = 'Replace all 5 components of monitor 7 with these 2? [y/N]';

      const result = await scanInTerminal(
        api,
        ['--provider', 'AWS', '--describe', 'Lambda and DynamoDB in Oregon'],
        [{ input: 'y\n', waitFor: prompt }],
      );

      expect({
        exitCode: result.exitCode,
        prompted: result.output.includes(prompt),
        writes: writesOf(api),
      }).toMatchObject({
        exitCode: 0,
        prompted: true,
        writes: [
          {
            body: { config: { thirdPartyService: { trackedComponentIds: [1001, 2001] } } },
            method: 'PATCH',
            path: '/v3/monitors/7',
          },
        ],
      });
    },
  );
});

describe('scan 3rd-party: attribution and errors', () => {
  it.each([
    {
      args: ['--provider', 'AWS'],
      expectedRoutes: [
        'GET /v3/third-party-providers',
        'GET /v3/monitors',
        'GET /v3/third-party-providers/248/components',
        'POST /v3/monitors',
      ],
      monitorPages: [[]],
      path: 'creating a monitor',
    },
    {
      args: ['--provider', '248'],
      expectedRoutes: [
        'GET /v3/third-party-providers/248',
        'GET /v3/monitors',
        'GET /v3/third-party-providers/248/components',
        'PATCH /v3/monitors/7',
      ],
      monitorPages: [[getMockThirdPartyMonitor({ id: 7, trackedComponentIds: [3001] })]],
      path: 'updating a monitor',
    },
  ])(
    'attributes every request to the scan command when $path',
    async ({ args, expectedRoutes, monitorPages }) => {
      const api = await startFakeApi({ monitorPages });

      await scan(api, [...args, '--describe', 'Lambda and DynamoDB in Oregon', '--confirm']);

      expect({
        routes: routesOf(api),
        unattributed: api.requests
          .filter(
            (request) =>
              request.headers['x-uptimerobot-command'] !== 'scan:3rd-party' ||
              request.headers['x-uptimerobot-client'] !== 'cli',
          )
          .map((request) => `${request.method} ${request.path}`),
      }).toEqual({ routes: expect.arrayContaining(expectedRoutes), unattributed: [] });
    },
  );

  it('prints the API message when creating the monitor is refused', async () => {
    const api = await startFakeApi({
      writeFailure: {
        body: { code: '026-019', message: 'Monitor limit reached' },
        status: 403,
      },
    });

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'Lambda and DynamoDB in Oregon',
      '--confirm',
    ]);

    expect({ error: errorOf(result.stderr), exitCode: result.exitCode }).toMatchObject({
      error: { apiCode: '026-019', message: 'Monitor limit reached' },
      exitCode: 5,
    });
  });

  it('prints the API message when updating the monitor is refused', async () => {
    const api = await startFakeApi({
      monitorPages: [[getMockThirdPartyMonitor({ id: 7, trackedComponentIds: [1001] })]],
      writeFailure: {
        body: { code: '026-006', message: 'Some components do not belong to this provider' },
        status: 422,
      },
    });

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'Lambda and DynamoDB in Oregon',
      '--confirm',
    ]);

    expect({ error: errorOf(result.stderr), exitCode: result.exitCode }).toMatchObject({
      error: {
        apiCode: '026-006',
        message: 'Some components do not belong to this provider',
      },
      exitCode: 2,
    });
  });

  it('rejects --json together with --format before making a request', async () => {
    const api = await startFakeApi();

    const result = await scan(api, [
      '--provider',
      'AWS',
      '--describe',
      'lambda',
      '--json',
      '--format',
      'table',
    ]);

    expect({
      error: errorOf(result.stderr),
      exitCode: result.exitCode,
      requests: api.requests,
    }).toMatchObject({
      error: {
        code: 'INVALID_INPUT',
        message: expect.stringMatching(/--json.*--format|--format.*--json/),
      },
      exitCode: 2,
      requests: [],
    });
  });
});

const getMockScanLeaf = (overrides: Pick<Leaf, 'id' | 'name'> & Partial<Leaf>): Leaf => ({
  parentName: null,
  region: null,
  ...overrides,
});

const getMockWordResult = (word: string, leaves: Leaf[], regionLike = false): WordResult => ({
  leaves,
  regionLike,
  word,
});

const LAMBDA_OREGON_LEAF = getMockScanLeaf({
  id: 1001,
  name: 'AWS Lambda (Oregon)',
  parentName: 'AWS Lambda',
  region: OREGON,
});
const LAMBDA_IRELAND_LEAF = getMockScanLeaf({
  id: 1002,
  name: 'AWS Lambda (Ireland)',
  parentName: 'AWS Lambda',
  region: IRELAND,
});
const REPOSITORY_OREGON_LEAF = getMockScanLeaf({
  id: 1003,
  name: 'AWS Serverless Application Repository (Oregon)',
  parentName: 'AWS Serverless Application Repository',
  region: OREGON,
});
const DYNAMODB_OREGON_LEAF = getMockScanLeaf({
  id: 2001,
  name: 'Amazon DynamoDB (Oregon)',
  parentName: 'Amazon DynamoDB',
  region: OREGON,
});
const DYNAMODB_IRELAND_LEAF = getMockScanLeaf({
  id: 2002,
  name: 'Amazon DynamoDB (Ireland)',
  parentName: 'Amazon DynamoDB',
  region: IRELAND,
});
const S3_OREGON_LEAF = getMockScanLeaf({
  id: 3001,
  name: 'Amazon Simple Storage Service (Oregon)',
  parentName: 'Amazon Simple Storage Service',
  region: OREGON,
});

describe('third-party scan: turning a description into search words', () => {
  it('drops the words of the provider name, ignoring case', () => {
    expect(searchWords('Google CLOUD storage', 'Google Cloud')).toEqual(['storage']);
  });

  it('drops stop-words', () => {
    expect(searchWords('we use lambda and dynamodb in the cloud', 'AWS')).toEqual([
      'lambda',
      'dynamodb',
      'cloud',
    ]);
  });

  it('drops tokens shorter than two characters', () => {
    expect(searchWords('s3 x lambda 7', 'AWS')).toEqual(['s3', 'lambda']);
  });

  it('lowercases the words', () => {
    expect(searchWords('Lambda DynamoDB', 'AWS')).toEqual(['lambda', 'dynamodb']);
  });

  it('lists each word once, in the order it first appears', () => {
    expect(searchWords('lambda dynamodb Lambda LAMBDA', 'AWS')).toEqual(['lambda', 'dynamodb']);
  });

  it('searches for the words when any remain', () => {
    expect(searchTerms('Lambda and DynamoDB in Oregon', 'AWS')).toEqual([
      'lambda',
      'dynamodb',
      'oregon',
    ]);
  });

  it('searches for the whole description as one phrase when it names the provider and everything else is a stop-word', () => {
    expect(searchTerms('cloud run', 'Google Cloud')).toEqual(['cloud run']);
  });

  it.each([
    { description: 'Google Cloud', says: 'only the provider name' },
    { description: 'and the with', says: 'only stop-words' },
    { description: 'x', says: 'one character' },
  ])('has nothing to search for when the description is $says', ({ description }) => {
    expect(searchTerms(description, 'Google Cloud')).toEqual([]);
  });
});

describe('third-party scan: combining the results of several words', () => {
  it('keeps every leaf the words found when none of them was a region', () => {
    const results = [
      getMockWordResult('lambda', [LAMBDA_OREGON_LEAF, LAMBDA_IRELAND_LEAF]),
      getMockWordResult('dynamodb', [DYNAMODB_OREGON_LEAF]),
    ];

    expect(narrowByRegions(results)).toEqual([
      { ...LAMBDA_OREGON_LEAF, matchedBy: 'lambda' },
      { ...LAMBDA_IRELAND_LEAF, matchedBy: 'lambda' },
      { ...DYNAMODB_OREGON_LEAF, matchedBy: 'dynamodb' },
    ]);
  });

  it('keeps every leaf of the regions when every word was a region', () => {
    const results = [
      getMockWordResult('oregon', [LAMBDA_OREGON_LEAF, DYNAMODB_OREGON_LEAF], true),
      getMockWordResult('ireland', [LAMBDA_IRELAND_LEAF], true),
    ];

    expect(narrowByRegions(results)).toEqual([
      { ...LAMBDA_OREGON_LEAF, matchedBy: 'oregon' },
      { ...DYNAMODB_OREGON_LEAF, matchedBy: 'oregon' },
      { ...LAMBDA_IRELAND_LEAF, matchedBy: 'ireland' },
    ]);
  });

  it('keeps a leaf found by a plain word only when a region word matched it too', () => {
    const results = [
      getMockWordResult('lambda', [LAMBDA_OREGON_LEAF, LAMBDA_IRELAND_LEAF]),
      getMockWordResult('dynamodb', [DYNAMODB_OREGON_LEAF, DYNAMODB_IRELAND_LEAF]),
      getMockWordResult('oregon', [LAMBDA_OREGON_LEAF, DYNAMODB_OREGON_LEAF, S3_OREGON_LEAF], true),
    ];

    expect(narrowByRegions(results)).toEqual([
      { ...LAMBDA_OREGON_LEAF, matchedBy: 'lambda' },
      { ...DYNAMODB_OREGON_LEAF, matchedBy: 'dynamodb' },
    ]);
  });

  it('credits a leaf to the first word that matched it and lists it once', () => {
    const results = [
      getMockWordResult('lambda', [LAMBDA_OREGON_LEAF, LAMBDA_IRELAND_LEAF]),
      getMockWordResult('serverless', [LAMBDA_IRELAND_LEAF, REPOSITORY_OREGON_LEAF]),
    ];

    expect(taggedBy(results)).toEqual([
      { ...LAMBDA_OREGON_LEAF, matchedBy: 'lambda' },
      { ...LAMBDA_IRELAND_LEAF, matchedBy: 'lambda' },
      { ...REPOSITORY_OREGON_LEAF, matchedBy: 'serverless' },
    ]);
  });
});

describe('third-party scan: reading components from catalog rows', () => {
  it('flattens the children of every row into leaves that carry their parent name and region', () => {
    const rows = [
      getMockGroup(1000, 'AWS Lambda', [LAMBDA_OREGON, LAMBDA_IRELAND]),
      getMockGroup(2000, 'Amazon DynamoDB', [DYNAMODB_OREGON]),
    ];

    expect(leavesIn(rows)).toEqual([LAMBDA_OREGON_LEAF, LAMBDA_IRELAND_LEAF, DYNAMODB_OREGON_LEAF]);
  });

  it.each([
    { row: asRootLeaf(CONSOLE_OREGON), shape: 'an empty children list' },
    { row: CONSOLE_OREGON, shape: 'no children' },
  ])('treats a row with $shape as a leaf of its own, without a parent', ({ row }) => {
    expect(leavesIn([row])).toEqual([
      getMockScanLeaf({ id: 4000, name: 'AWS Management Console (Oregon)', region: OREGON }),
    ]);
  });
});

describe('third-party scan: recognising the provider monitor', () => {
  it.each([[null], [[]]])(
    'scopes a monitor to all components when its trackedComponentIds is %j',
    (trackedComponentIds) => {
      const row = getMockThirdPartyMonitor({ id: 7, providerId: 248, trackedComponentIds });

      expect(asMonitor(row, 248)).toEqual({ id: 7, scope: 'all', trackedComponentIds: [] });
    },
  );

  it('scopes a monitor to a list when it tracks specific components', () => {
    const row = getMockThirdPartyMonitor({
      id: 7,
      providerId: 248,
      trackedComponentIds: [1001, 2001],
    });

    expect(asMonitor(row, 248)).toEqual({
      id: 7,
      scope: 'list',
      trackedComponentIds: [1001, 2001],
    });
  });

  it('ignores a third-party monitor of another provider', () => {
    const row = getMockThirdPartyMonitor({ providerId: 99, trackedComponentIds: [1001] });

    expect(asMonitor(row, 248)).toBeUndefined();
  });

  it('ignores a monitor of another type even when its config names the provider', () => {
    const row = { ...getMockThirdPartyMonitor({ providerId: 248 }), type: 'HTTP' };

    expect(asMonitor(row, 248)).toBeUndefined();
  });
});

describe('third-party scan: finding a provider name in a description', () => {
  it.each([
    { name: 'Cloudflare', occurs: true, text: 'free workers on cloudflare' },
    { name: 'Google Cloud', occurs: true, text: 'we run on GOOGLE CLOUD' },
    { name: 'Cloudflare', occurs: false, text: 'free cloudflared tunnels' },
    { name: 'AWS', occurs: false, text: 'jaws and claws' },
    { name: 'S3', occurs: false, text: 'buckets3 and more' },
  ])('reports $occurs when "$name" is looked for in "$text"', ({ name, occurs, text }) => {
    expect(occursAsWords(name, text)).toBe(occurs);
  });
});
