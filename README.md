# Bropilot

A World workspace and portable Rust core for defining purposeful systems, checking model readiness and exploring revision-pinned Things.

The workspace includes a **read-only personal-assistant example**: goals, tasks, modeled calendar blocks and progress review. The calendar is disconnected. A separate local Worker-app World exercises immutable candidate submission, protected verification and canonical promotion. Detailed editors, hosted execution and deployment remain roadmap work.

## Run locally

Use Node 22.12 or newer, the Rust toolchain selected by `rust-toolchain.toml`, and `wasm-pack` 0.15.0.

```sh
cargo install wasm-pack --version 0.15.0 --locked
npm ci
npm run build
npm run dev:worker
```

Open <http://127.0.0.1:8791>. The Worker serves the built Vue UI and executes the Rust core as Wasm. Its configuration dry run does not deploy remotely. For UI development after building, `npm run dev` starts Vite with an API proxy to the running local Worker.

Create a local World, open Work, create a Move and choose the working or broken-health example. Submit the candidate, request verification and inspect the four actual checks in Evaluations. A passing candidate can be promoted; a failing candidate remains blocked. Promotion changes the canonical source revision; it does not deploy the candidate.

`dev:worker` supervises the Worker and a separately credentialed verifier. Local SQLite state and private session credentials live under ignored `.local-session/`; state survives restarts. The verifier accepts bounded `worker.ts`/`public/` source bundles, builds in memory and runs isolated workerd without package installation, platform credentials or outbound network. The deployable Worker configuration disables these local mutation routes. This is local operator access, not hosted collaborator authentication or a Git/Cloudflare Artifacts adapter.

Source bundles allow 1–64 UTF-8 text files, at most 64 KiB including path bytes. Paths use printable ASCII, at most 256 bytes, with relative nonempty segments and no `.`/`..`, backslashes or drive prefixes. Protected hooks and runner versions are frozen when the World is created; changing the verifier requires a new World in this slice.

## Check

```sh
npx playwright install chromium
npm run check
```

The checks cover generated-contract drift, Rust formatting/lint/tests, isolated verifier execution, durable HTTP/promotion/restart behavior, native/workerd parity and desktop/mobile browser behavior. On Linux, install Chromium system dependencies with `npx playwright install --with-deps chromium`.

Rust owns the domain model, readiness and queries in `crates/`; it generates `packages/contracts/`. `apps/web/` owns UI state and layout. `apps/worker/` handles bounded HTTP transport and the Workers-specific Wasm loader. Regenerate contracts with `npm run contracts:generate`, then rebuild Wasm with `npm run build:wasm`. All generated contracts are committed; compiled Wasm is rebuilt and ignored.

Local CLI: `cargo run --locked -p bropilot-query` accepts a v1 JSON query on stdin and returns the same response as `POST /api/v1/query`. `GET /api/v1/examples` lists sample revisions; `GET /api/v1/worlds/:worldId/revisions/:revisionId` reads exactly the requested example revision.

The [canonical requirements](docs/world-platform-plan-and-requirements.md), [GRREAT context](docs/grreat/README.md) and [decisions](docs/decision_log.md) govern subsequent work. `lfp/` and `uip/` remain exploratory references.
