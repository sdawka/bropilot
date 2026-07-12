# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Goals

Bropilot Studio is a **form + display for a system's knowledge graph**. A user collects everything known about a system across three parts — **Foundations** (what/why/who), **Domain** (the ubiquitous language), **Implementation** (the code) — and explores it as an interactive node-link graph. The output is a canonical **Bropilot JSON graph** (`{ nodes, edges }`) that round-trips with the `/bropilot-extract` and `/bropilot-generate` skills. It is intentionally **client-only** (no backend) and portable.

The app lives entirely under `web/`. The repo-root `README.md` is a placeholder; `web/README.md` is the real one.

## Commands

All commands run from `web/`:

```bash
cd web
npm install
npm run dev        # dev server → http://localhost:4321
npm run build      # static build → web/dist/
npm run preview    # serve the build
npm run check       # astro check (type-check .astro/.vue/.ts)
```

There is **no test suite and no linter configured** — `npm run check` is the only static gate. Tailwind has **no config file**: theme tokens (colours, fonts) are defined in the `@theme` block of `web/src/styles/global.css` (Tailwind v4 + `@tailwindcss/vite`).

## Architecture (the big picture)

**`src/lib/schema.ts` is the single source of truth.** The `KINDS` registry (each `KindDef`) drives the editor forms, the graph legend, and the part views simultaneously. Add a node kind there — with its `part`, `space`, `icon`, and `fields` — and it automatically appears everywhere. Read this file first before changing any UI.

**Two orthogonal groupings, both on every `KindDef`:**
- `part` (`foundations` | `domain` | `implementation`) — the display grouping the studio navigates by. Drives `PartView`.
- `space` (`basics` | `problem` | `solution` | `crosscutting`) — the canonical Bropilot semantic layer. Drives node/edge **colour** and the graph legend filters.
Don't collapse these — a part spans multiple spaces (e.g. Implementation = `solution` + `crosscutting`).

**Single Vue island, not multi-page Astro.** `pages/index.astro` mounts one `<Studio client:only="vue">`. All interactive state is inside that one island because Astro islands cannot share reactive state across separate mounts. Client-side "routing" between Overview / the three parts / Graph is just a `view` ref in `Studio.vue`.

**The store is a reactive singleton.** `src/lib/store.ts` exports a Vue `reactive()` `state` object plus mutation functions. `hydrate()` **must be called once client-side** (done in `Studio.vue` `onMounted`) — during SSR the store is empty; on first client load it seeds from `SAMPLE_GRAPH`. A deep `watch` autosaves the whole graph to `localStorage` (`bropilot:graph:v1`) on every change. Node ids follow `{kind}-{kebab-title}`; kind-specific extra fields live in **`node.props`**, never as top-level node keys.

**`ForceGraph.vue` bridges d3-force to Vue manually.** d3-force mutates plain sim-node objects (x/y/vx/vy); reactivity is bridged with a `frame` counter ref incremented on every `tick`, and the `links`/`dots` computeds read `frame.value` to re-run each frame. Node positions are preserved across graph rebuilds via a `nodeIndex` map keyed by node id. **Pan, zoom, and drag are hand-rolled** with pointer events and a `view` transform (`{k,x,y}`) — d3-zoom/d3-drag are deliberately not used. Selecting a node computes its neighbour set to spotlight it and dim the rest.

## What's already been tried / decided (don't re-litigate)

- **Persistence:** client-only `localStorage` + JSON import/export was chosen over SSR file-backed and backend/DB options. Keep it backend-free.
- **Display:** both structured per-part panels *and* the force graph — not one or the other.
- **Single island** was chosen over Astro multi-page routing specifically so the editor and graph share live state. Adding real Astro pages would fragment the store.
- **Graph rendering:** SVG (not canvas), d3-force for layout only, manual interaction. This was intentional for stylability and hit-testing.
- **Schema extensions:** `goal`, `hypothesis`, and `term` kinds were added beyond the stock Bropilot schema to satisfy the three-part brief. The eight stock edge types are unchanged.

## Verifying UI changes

Because the app is a `client:only` island, **a passing `npm run build` does not prove it renders** — always verify in a browser. The pattern used here: start `npm run dev`, then drive headless Chrome over the DevTools Protocol via a throwaway Node script (examples live in the session scratchpad). Important gotcha found: **synthetic `PointerEvent` dispatch does not trigger node selection** (pointer-capture semantics) — use real `Input.dispatchMouseEvent` (mousePressed/mouseReleased) at the node's on-screen coordinates instead.
