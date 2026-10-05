# Cloudflare Artifacts and how uip should use Cloudflare

Researched 2026-10-04. Sources were fetched from developers.cloudflare.com and blog.cloudflare.com.
The cloudflare-docs MCP tool was not available, so WebSearch and WebFetch were used.

## What it is

Artifacts exists under that exact name. It is Cloudflare's "versioned storage that speaks Git".
Each repository has its own history and branches, a stable HTTPS remote, and separate read and write tokens.
Repos are created and managed from a Workers binding, a REST API, or any standard Git client.
It launched in beta on 2026-04-16 and reached open beta on 2026-10-01.

- Overview: https://developers.cloudflare.com/artifacts/
- Launch post: https://blog.cloudflare.com/artifacts-git-for-agents-beta/
- Beta changelog: https://developers.cloudflare.com/changelog/post/2026-04-16-artifacts-now-in-beta/
- Open beta changelog: https://developers.cloudflare.com/changelog/post/2026-10-01-artifacts-open-beta/
- Product page: https://www.cloudflare.com/products/artifacts/
- Related: https://blog.cloudflare.com/next-git-platform-on-cloudflare/ and https://github.com/cloudflare/artifact-fs

Stated use cases: versioned file trees instead of blobs, per-agent or per-session repos, forking to explore parallel changes, and platforms that store customer projects.
Open beta added Workers Builds integration, event subscriptions (create, import, fork, delete, change), US or EU data localization, and metrics.

## Binding surface

Wrangler config (source: https://developers.cloudflare.com/artifacts/api/workers-binding/):

```jsonc
"artifacts": [{ "binding": "ARTIFACTS", "namespace": "default" }]
```

Namespace methods:
- `create(name, {readOnly?, description?, setDefaultBranch?})`
- `get(name)`
- `list({limit?, cursor?})`
- `import({source:{url,branch?,depth?}, target:{name, opts?}})`
- `delete(name)`

Repo handle methods:
- `info()`
- `createToken("read"|"write", ttl?)`, `listTokens()`, `revokeToken()`
- `fork(name, {readOnly?, defaultBranchOnly?})`
- `log({ref,limit,offset})`, `readCommit(hash)`, `readTree(hash)`, `readBlob(hash)`
- `readFile({ref, path})`, which returns a Blob or null

`create` and `import` return a `remote` URL and a `token`.
Git clients use the form `https://x:${TOKEN}@<id>.artifacts.cloudflare.net/git/<repo>.git`.

Gap: the Workers binding only reads. Writing commits happens over the Git protocol with a write token.
So the worker either needs a Git client library (for example isomorphic-git against the remote) or an agent that runs `git push`.
I did not verify whether the binding gained a direct commit API. Check the REST API page before building the write path.

## Pricing and limits

Billing starts 2026-10-14 and requires the Workers Paid plan.
Pricing is $0.15 per 1,000 operations (first 10,000 per month included) and $0.50 per GB-month (first 1 GB included).
Source: the launch blog and the open beta changelog. The pricing page itself was not fetched.

Limits (https://developers.cloudflare.com/artifacts/platform/limits/):
- 1 GB per repo and 32 MB per file.
- 1 TB per account, with unlimited repos and namespaces.
- 2,000 control-plane requests per 10 seconds per namespace.
- 2,000 Git requests per 10 seconds per repo.
- Names: 2 to 63 characters, starting with a letter or digit, then letters, digits, `.`, `_`, `-`.

## Where Artifacts fits in uip

Artifacts stores versioned file trees, so it maps cleanly onto "semantic GitHub".

| uip concept | Artifacts mapping |
|---|---|
| Project (a graph) | One repo, named by project slug, for example `proj-<slug>` |
| Ontology snapshot | `graph.json` at the repo root, plus optionally one file per space for readable diffs |
| Changeset or agent decision batch | A commit on a branch such as `agent/<session-id>`, with System One decisions and confidences in the message or a `decisions/<ts>.json` file |
| Proposal and review | Fork or branch, then compare, then merge into `main` |
| History and time travel | `log()` for the timeline, `readFile({ref, path})` to render the graph at any commit |
| Read-only share link | `createToken("read", ttl)` |

Recommendation for the prototype:
- Stage 1 (ship first): bundle seed projects as static JSON in the SPA. No Artifacts dependency, so the UI work is not blocked.
- Stage 2 (behind a feature flag, for example `VITE_STORE=artifacts`): the API worker reads the project list with `ARTIFACTS.list()` and a graph with `readFile({ref:"main", path:"graph.json"})`. History comes from `log()`.
- Stage 3: write path through a changeset endpoint that commits using a write token. Seed repos once with `import()` from a GitHub repo of fixtures, or with a push from a script.
- Keep the graph as stable-sorted, pretty-printed JSON so Git diffs stay meaningful.

Artifacts is not needed for hosting. Static assets are the right host for the SPA.

## Hosting: Workers with static assets

Source: https://developers.cloudflare.com/workers/static-assets/binding/

`wrangler.jsonc` (place it in `uip/`, run wrangler from that directory):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "uip",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-04",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*"]
  },
  "artifacts": [{ "binding": "ARTIFACTS", "namespace": "default" }],
  "observability": { "enabled": true }
}
```

Notes:
- `nodejs_compat` is on by default for compatibility dates from 2026-08-04, so no flag is needed.
- If the `artifacts` block is rejected by your wrangler version, upgrade wrangler. Remove the block while Stage 1 is the only stage.
- `run_worker_first` limited to `/api/*` keeps static asset requests free and fast. The SPA fallback serves `index.html` for deep links.
- Use `@cloudflare/vite-plugin` if you want `vite dev` to run the worker locally with the same bindings.

## Secrets

- The System One key is a runtime secret. Never put it in `vars` or any `VITE_` variable.
- Local dev: `uip/.dev.vars` (gitignored) with `OPENROUTER_API_KEY=...` or `TYPESAFE_API_KEY=...`.
- Production: `wrangler secret put OPENROUTER_API_KEY`. This is a user-run step. I did not run it.
- Optional: route model calls through AI Gateway for logging and caching, by pointing the base URL at `https://gateway.ai.cloudflare.com/v1/{acct}/{gw}/openrouter/v1/chat/completions`. Verify the model ID against `lfp/src/ai/decisionConfig.ts` rather than hardcoding.

## Worker entry outline (`uip/worker/index.ts`)

```ts
interface Env {
  ASSETS: Fetcher;
  ARTIFACTS: Artifacts;              // from `wrangler types`
  OPENROUTER_API_KEY: string;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    // POST /api/decide  { state, questions } -> System One typed decisions
    if (url.pathname === "/api/decide" && req.method === "POST") {
      const body = await req.json();
      // Reuse the question-chain and parsing logic from lfp/agent/system1.ts.
      // Server holds the key; the browser never sees it.
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(buildSystem1Request(body)),
      });
      return Response.json(parseSystem1(await r.json()));
    }

    // GET /api/projects, GET /api/projects/:id/graph?ref=main, GET /api/projects/:id/log
    if (url.pathname === "/api/projects") { /* list() from ARTIFACTS, or static seed */ }

    // POST /api/projects/:id/changesets  (Stage 3, commit with a write token)

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

Commands:

```bash
cd uip && npx wrangler types && npx tsc --noEmit
npx wrangler dev          # local, no login needed for static assets and secrets in .dev.vars
```

Local `wrangler dev` with a real `artifacts` binding may need remote mode and a login. Keep Stage 2 behind the flag with a static fallback.

## Open items

- Confirm whether the binding or REST API supports committing files without a Git client.
- Confirm Artifacts availability on the account's Workers Paid plan before 2026-10-14 billing.
- Clef (the newer System One model) was not researched here.
