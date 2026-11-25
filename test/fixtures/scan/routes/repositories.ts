/**
 * Sample repositories for the route scanner, held as data rather than as files
 * on disk: a checked-in `broken.ts` or `route.ts` importing `next/server`
 * would be picked up by the repository's own `tsc` and `oxlint` runs. The test
 * writes the tree it needs into a temporary directory instead.
 *
 * Each entry maps a repo-relative POSIX path to that file's contents.
 */

export type RepositoryFixture = Readonly<Record<string, string>>;

/** Next.js App Router, including every segment shape that is not a path part. */
export const NEXT_APP_REPOSITORY: RepositoryFixture = {
  'app/page.tsx': 'export default function Home() {\n  return <h1>Home</h1>;\n}\n',
  'app/api/health/route.ts': [
    "import { NextResponse } from 'next/server';",
    '',
    'export async function GET() {',
    '  return NextResponse.json({ ok: true });',
    '}',
    '',
    'export async function POST(request: Request) {',
    '  return NextResponse.json({ received: await request.text() });',
    '}',
    '',
  ].join('\n'),
  'app/api/legacy/route.js': "const handler = () => new Response('ok');\n\nexport { handler };\n",
  'app/(marketing)/(promo)/about/page.tsx':
    'export default function About() {\n  return null;\n}\n',
  'app/blog/[slug]/page.tsx': 'export default function Post() {\n  return null;\n}\n',
  'app/docs/[...path]/page.tsx': 'export default function Docs() {\n  return null;\n}\n',
  'app/shop/[[...filters]]/page.tsx': 'export default function Shop() {\n  return null;\n}\n',
  'app/dashboard/@analytics/page.tsx': 'export default function Panel() {\n  return null;\n}\n',
  'app/_components/page.tsx': 'export default function Private() {\n  return null;\n}\n',
};

/** The same router rooted at `src/app`, which Next.js treats identically. */
export const NEXT_SRC_APP_REPOSITORY: RepositoryFixture = {
  'src/app/page.tsx': 'export default function Home() {\n  return null;\n}\n',
  'src/app/api/status/route.ts': 'export function GET() {\n  return Response.json({});\n}\n',
  'src/app/(auth)/login/page.tsx': 'export default function Login() {\n  return null;\n}\n',
};

/** Next.js Pages Router, including the reserved files that never route. */
export const NEXT_PAGES_REPOSITORY: RepositoryFixture = {
  'pages/index.tsx': 'export default function Home() {\n  return null;\n}\n',
  'pages/_app.tsx': 'export default function App() {\n  return null;\n}\n',
  'pages/_document.tsx': 'export default function Doc() {\n  return null;\n}\n',
  'pages/_error.tsx': 'export default function Err() {\n  return null;\n}\n',
  'pages/_lib/helpers.ts': 'export const helper = () => null;\n',
  'pages/blog/index.tsx': 'export default function Blog() {\n  return null;\n}\n',
  'pages/blog/[id].tsx': 'export default function Post() {\n  return null;\n}\n',
  'pages/blog/post.test.tsx': "it('is not a route', () => {});\n",
  'pages/api/ping.ts': 'export default function handler() {}\n',
  'pages/api/users/[...rest].ts': 'export default function handler() {}\n',
  'pages/api/search/[[...query]].ts': 'export default function handler() {}\n',
};

export const NEXT_SRC_PAGES_REPOSITORY: RepositoryFixture = {
  'src/pages/index.tsx': 'export default function Home() {\n  return null;\n}\n',
  'src/pages/api/webhook.ts': 'export default function handler() {}\n',
};

export const DJANGO_REPOSITORY: RepositoryFixture = {
  'project/urls.py': [
    'from django.urls import include, path, re_path',
    '',
    'from . import views',
    '',
    'urlpatterns = [',
    "    path('', views.index, name='index'),",
    "    path('api/health/', views.health, name='health'),",
    "    re_path(r'^api/orders/(?P<pk>\\d+)/$', views.order),",
    "    path('billing/', include('billing.urls')),",
    ']',
    '',
  ].join('\n'),
  'billing/urls.py':
    'from django.urls import path\n\nurlpatterns = [\n    path("invoices/", v),\n]\n',
  // Neither `os.path.join` nor a name merely ending in `path` is a route.
  'project/settings.py': [
    'import os.path',
    '',
    "STATIC_ROOT = os.path.join('static/')",
    "LEGACY = custom_path('should-not-match/')",
    '',
  ].join('\n'),
};

export const RAILS_REPOSITORY: RepositoryFixture = {
  'config/routes.rb': [
    'Rails.application.routes.draw do',
    "  get '/health', to: 'health#show'",
    '  post "/api/v1/sessions", to: \'sessions#create\'',
    "  patch 'account' => 'accounts#update'",
    "  delete '/api/v1/sessions', to: 'sessions#destroy'",
    '',
    '  resources :monitors',
    '  resource :profile, only: [:show]',
    'end',
    '',
  ].join('\n'),
  'app/controllers/health_controller.rb': "class HealthController\n  get 'not-a-route'\nend\n",
};

export const EXPRESS_REPOSITORY: RepositoryFixture = {
  'server.js': [
    "const express = require('express');",
    '',
    'const app = express();',
    '',
    "app.get('/health', (req, res) => res.send('ok'));",
    "app.post('/api/v1/monitors', (req, res) => res.send('created'));",
    "app.use('/api/v1', usersRouter);",
    '',
    'const cache = new Map();',
    "cache.get('lookup-key');",
    "response.headers.get('content-type');",
    '',
    'module.exports = app;',
    '',
  ].join('\n'),
  'src/routes/users.ts': [
    "import { Router } from 'express';",
    '',
    'const router = Router();',
    '',
    "router.get('/users', (_req, res) => res.json([]));",
    "router.delete('/users/:id', (_req, res) => res.status(204).end());",
    "this.app.all('/users/:id/audit', (_req, res) => res.json({}));",
    '',
    'export default router;',
    '',
  ].join('\n'),
};

/**
 * Files a scan must survive or refuse to open: unparseable sources, dotenv
 * files whose contents would produce findings if they were ever read, and
 * directories that are never sources.
 */
export const HOSTILE_REPOSITORY: RepositoryFixture = {
  '.env': 'API_KEY=fixture-secret-never-read\n',
  '.env.local': "app.get('/leaked-from-env-local');\n",
  '.env.ts': "app.get('/leaked-from-dotenv-ts');\n",
  '.envrc': "app.get('/leaked-from-envrc');\n",
  'production.env': "app.get('/leaked-from-suffixed-env');\n",
  'broken.ts': "function ((((( unterminated 'string\napp.get('/broken-but-found', ) => {{{{\n",
  'config/routes.rb':
    "Rails.application.routes.draw do\n  get %q{weird}\n  get '/reachable'\nend\n",
  'urls.py': "urlpatterns = [ path( 'ok/' , v ) , path(\n",
  'node_modules/express/lib/router.js': "app.get('/from-node-modules');\n",
  'dist/bundle.js': "app.get('/from-dist');\n",
  'build/bundle.js': "app.get('/from-build');\n",
  '.next/server/page.js': "app.get('/from-next');\n",
  'vendor/bundle/config/routes.rb': "get '/from-vendor'\n",
  '__pycache__/urls.py': "path('from-pycache/')\n",
  '.venv/lib/urls.py': "path('from-venv/')\n",
  '.git/hooks/urls.py': "path('from-git/')\n",
};
