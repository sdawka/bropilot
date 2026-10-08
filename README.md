# Bropilot

A World workspace and portable Rust core for defining purposeful systems, checking model readiness and exploring revision-pinned Things.

The current foundation uses a **read-only personal-assistant example**: goals, tasks, modeled calendar blocks and progress review. The calendar is disconnected. Detailed editors, live agent work, candidate comparison, persistence, promotion and deployment are later roadmap work; placeholders identify these boundaries.

## Run locally

Use Node 22.12 or newer, the Rust toolchain selected by `rust-toolchain.toml`, and `wasm-pack` 0.15.0.

```sh
cargo install wasm-pack --version 0.15.0 --locked
npm ci
npm run build
npm run dev:worker
```

Open <http://127.0.0.1:8791>. The Worker serves the built Vue UI and executes the Rust core as Wasm. Its configuration dry run does not deploy remotely. For UI development after building, `npm run dev` starts Vite with an API proxy to the running local Worker.

## Check

```sh
npx playwright install chromium
npm run check
```

The checks cover generated-contract drift, Rust formatting/lint/tests, UI checks, native/workerd parity and desktop/mobile browser behavior. On Linux, install Chromium system dependencies with `npx playwright install --with-deps chromium`.

Rust owns the domain model, readiness and queries in `crates/`; it generates `packages/contracts/`. `apps/web/` owns UI state and layout. `apps/worker/` handles bounded HTTP transport and the Workers-specific Wasm loader. Regenerate contracts with `npm run contracts:generate`, then rebuild Wasm with `npm run build:wasm`. All generated contracts are committed; compiled Wasm is rebuilt and ignored.

Local CLI: `cargo run --locked -p bropilot-query` accepts a v1 JSON query on stdin and returns the same response as `POST /api/v1/query`. `GET /api/v1/examples` lists sample revisions; `GET /api/v1/worlds/:worldId/revisions/:revisionId` reads exactly the requested example revision.

The [canonical requirements](docs/world-platform-plan-and-requirements.md), [GRREAT context](docs/grreat/README.md) and [decisions](docs/decision_log.md) govern subsequent work. `lfp/` and `uip/` remain exploratory references.
