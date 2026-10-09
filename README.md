# Bropilot

A World workspace and portable Rust core for defining purposeful systems, checking model readiness and exploring revision-pinned Things.

The workspace includes a **read-only personal-assistant example**: goals, tasks, modeled calendar blocks and progress review. The calendar is disconnected. A separate Worker-app World exercises immutable candidate submission, protected verification, canonical promotion and explicit deployment. Detailed editors and broader assistant workflows remain roadmap work.

## Run locally

Use Node 22.12 or newer, the Rust toolchain selected by `rust-toolchain.toml`, and `wasm-pack` 0.15.0.

```sh
cargo install wasm-pack --version 0.15.0 --locked
npm ci
npm run build
npm run dev:worker
```

Open <http://127.0.0.1:8791>. The Worker serves the built Vue UI and executes the Rust core as Wasm. Its configuration dry run does not deploy remotely. For UI development after building, `npm run dev` starts Vite with an API proxy to the running local Worker.

Open **Ontology lab** or <http://127.0.0.1:8791/lab/ontology> to try description/chat → ontology → criteria feedback. **Explore example** uses a labelled extraction fixture and real Rust checks. **Run with Codex** sends the entered conversation to your locally signed-in Codex CLI (`codex login`); extraction runs without tools in an empty directory. Select a log step or use Previous/Next/Play to inspect its exact checkpoint and highlights. Follow-up messages create a fresh isolated draft; saved runs and JSON export preserve replay. The lab does not modify canonical Worlds or perform calendar/deployment actions, and its local runner is unavailable in hosted deployments.

Feedback leads with one useful question and explains the gap behind it; other questions stay optional. **Answer this** keeps the question alongside your reply, so a short answer has context. Assistant questions cannot supply ontology facts. **New description** starts a fresh conversation while retaining saved runs.

Choose **Try a realization** to open a local Worker-app World, then **Start a Move**. The working example is ready to use; a broken-health example and source editing are also available. **Submit candidate**, then **Run checks** to inspect the four actual checks in Evaluations. World and revision switching live under **World context**. A passing candidate can be promoted; a failing candidate remains blocked. Promotion changes the canonical source revision; it does not deploy the candidate.

`dev:worker` supervises the Worker and a separately credentialed verifier. Local SQLite state and private session credentials live under ignored `.local-session/`; state survives restarts. The verifier accepts bounded `worker.ts`/`public/` source bundles, builds in memory and runs isolated workerd without package installation, platform credentials or outbound network. The default deployable Worker configuration disables these local mutation routes. Hosted staging uses separate Access identities, scoped service credentials, Artifacts source repositories and private OAuth connections.

Source bundles allow 1–64 UTF-8 text files, at most 64 KiB including path bytes. Paths use printable ASCII, at most 256 bytes, with relative nonempty segments and no `.`/`..`, backslashes or drive prefixes. Protected hooks and runner versions are frozen when the World is created; changing the verifier requires a new World in this slice.

## Hosted staging

The staging configuration in `apps/worker/wrangler.jsonc` uses Access identities, SQLite Durable Objects, a deployment Workflow, the platform-owned `bropilot-worlds` Artifacts namespace and `bropilot-build-packages-staging` R2 bucket. Provision those named storage resources in the platform account before release. The full-stack application Thing deploys separately into the owner's OAuth-connected account, to one dedicated Worker; it has no database bindings or package installation in this slice.

Register a confidential Cloudflare OAuth client with the exact HTTPS callback `https://<staging-host>/api/v1/cloudflare/connections/callback`. Public use across accounts requires Cloudflare's verified client-domain setup. Use the current OAuth scope catalog for Workers Admin, account read and offline refresh; check that the grant can create Workers and upload versions/assets. Protect the UI and human API paths with an Access application. Exclude the verifier job/run routes from the Access edge gate so the Worker can authenticate its own scoped bearer tokens; those routes still reject unregistered identities. The callback must retain the signed-in Access identity. Never use local credentials remotely.

Set the release environment variables named by `scripts/deploy-staging.mjs`: platform `CLOUDFLARE_ACCOUNT_ID`, Access team domain/audience, OAuth client ID/secret/callback/scopes, `CONNECTION_ENCRYPTION_KEY` (32 random bytes encoded as base64url), and comma-separated `TRUSTED_VERIFIER_SUBS` (Access subject IDs allowed to register a verifier). CI also requires a scoped platform `CLOUDFLARE_API_TOKEN`. The script rejects missing configuration, uploads private bindings with the version and removes its temporary secrets file. Run `npm run build`, `npm run check`, then `npm run deploy:staging -- --dry-run` before `npm run deploy:staging`. The manual Foundation CI release verifies the supplied full commit SHA before its staging job; PR pushes only test.

An authenticated World owner in `TRUSTED_VERIFIER_SUBS` can POST `{ "role": "verifier" }` to `/api/v1/worlds/:worldId/service-credentials`. Store the one-time returned raw token in a private file (mode `0600`, no newline), then run:

```sh
node packages/local-verifier/src/cli.mjs --hosted --origin https://<staging-host> --token-file <private-file> --watch
```

The credential is World-scoped and expires after one hour by default (maximum 24 hours). Revoke it with authenticated DELETE `/api/v1/worlds/:worldId/service-credentials/:tokenId`. Owners can separately issue Move-scoped implementation credentials; service credentials cannot approve promotion or deployment. Verification builds and probes run on the trusted operator machine; candidate code runs in isolated workerd without provider credentials or outbound access. Hosted shell builds and general dependency installs remain deferred.

Live acceptance requires creating a World, verifying and promoting A, connecting/confirming the exact target account, deploying A, then verifying/promoting/deploying B to the same Worker and explicitly rolling back to A while canonical B stays unchanged. Check source/build/provider lineage and health/page/API observations. A local dry run or successful promotion does not prove remote publication. Artifacts token minting and Git transport must also be checked on the real binding before release; provider compatibility remains unverified locally.

## Check

```sh
npx playwright install chromium
npm run check
```

The checks cover generated-contract drift, Rust formatting/lint/tests, isolated verifier execution, durable HTTP/promotion/restart behavior, native/workerd parity and desktop/mobile browser behavior. On Linux, install Chromium system dependencies with `npx playwright install --with-deps chromium`.

Rust owns the domain model, readiness and queries in `crates/`; it generates `packages/contracts/`. `apps/web/` owns UI state and layout. `apps/worker/` handles bounded HTTP transport and the Workers-specific Wasm loader. Regenerate contracts with `npm run contracts:generate`, then rebuild Wasm with `npm run build:wasm`. All generated contracts are committed; compiled Wasm is rebuilt and ignored.

Local CLI: `cargo run --locked -p bropilot-query` accepts a v1 JSON query on stdin and returns the same response as `POST /api/v1/query`. `GET /api/v1/examples` lists sample revisions; `GET /api/v1/worlds/:worldId/revisions/:revisionId` reads exactly the requested example revision.

The [canonical requirements](docs/world-platform-plan-and-requirements.md), [GRREAT context](docs/grreat/README.md) and [decisions](docs/decision_log.md) govern subsequent work. `lfp/` and `uip/` remain exploratory references.
