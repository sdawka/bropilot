<!-- grreat:record id=goal.north-star kind=north_star role=north_star status=active level=1 parent=none obverse=goal.obverse -->
# Bropilot v1 — a Cloudflare-hosted World platform

- Outcome: Deploy a usable Cloudflare-hosted World platform for invited collaborators and their local CLI agents.
- Why: Preserve purpose, structure, causal hypotheses, implementations and observations while people and agents realize changes concurrently and decide what becomes canonical.
- Authority: [Requirements](../world-platform-plan-and-requirements.md), especially sections 1–9 and 12; [user decisions](../decision_log.md).
- Scope: The minimum protocol and workspace, demonstrated with a personal assistant World whose first workflow organizes goals, identifies next actions and reviews progress. GRREAT informs its design. LFP and UIP inform exploration; they do not define the production contract.
- Constraints: No timeline-based planning. Agent providers, harnesses, count and orchestration remain user-selected. Hosted agents and advanced lifecycle automation are optional. Use Workers and Artifacts; verify additional integrations when needed.

## Success signals

- A collaborator can instantiate a World from a versioned Template, declare Purpose, Environment and Theory, identify readiness gaps, and make a scoped Move actionable under explicit rules.
- Concurrent local agents receive pinned, role-specific Task Packets and isolated workspaces; their competing or complementary Realizations retain checkpoints, identities and exact revision references.
- An authorized verifier records required evidence against the same acceptance contract. Candidate comparison and composition expose conflicts, missing or stale evidence, and permission violations.
- Promotion advances the World manifest atomically under policy, rejects a stale base, and preserves the selected candidates and decision provenance. Deployment remains separately authorized and recorded.
- The workspace distinguishes desired, canonical, candidate and deployed state, and links readiness, implementation conformance and outcome findings to their evidence or explicit unknowns.
- The example World demonstrates this flow on deployed Cloudflare services. Passing implementation checks alone does not establish a beneficiary outcome or causal effect.

Milestone completion criteria live in [[roadmap]] and are assessed in [[analysis]]. The six product goals below organize accepted requirements; their roadmap and execution records identify acceptance gaps, not new product decisions.

<!-- grreat:record id=goal.obverse kind=obverse role=obverse status=active level=2 parent=goal.north-star -->
## What would make the goal fail?

A release that cannot trace or safely authorize promoted changes from intent through concurrent work and evidence does not satisfy the goal, even if its diagram or demonstration appears successful.

<!-- grreat:record id=goal.model kind=goal role=goal status=active level=2 parent=goal.north-star -->
## Author a coherent, versioned World

- Outcome: A collaborator can instantiate an approved World/Thing Template, supply Purpose, Environment and Theory, inspect provenance-bearing draft edits, and obtain attributable readiness for the exact desired revision.
- Acceptance: Create, correct and apply a draft without losing accepted facts or weakening protected Templates/rules; distinguish required gaps from unknown coverage. Native and workerd must agree. Theory hypotheses remain hypotheses.
- Current boundary: Typed Rust/Wasm foundation and local draft lab are verified; generic canonical authoring, draft adoption, Template/Kit lifecycle and model migration remain open.
- Authority and plan: Requirements §§2, 4–5, 10; slices A and G. See [[roadmap]] and [[analysis]].

<!-- grreat:record id=goal.agents kind=goal role=goal status=active level=2 parent=goal.north-star -->
## Coordinate concurrent local agents safely

- Outcome: Harness-neutral local agents receive scoped, pinned Task Packets and isolated Realization workspaces, then claim, checkpoint, resume and submit attributable immutable candidates.
- Acceptance: Two real agents exercise competing or complementary work; expired claims, retries, duplicate events and stale packets cannot grant authority or duplicate transitions. Source mappings identify exact Thing/revision inputs.
- Current boundary: Candidate APIs and leases exist; complete packets, source-context expansion, agent checkpoints and live fork lifecycle are not demonstrated.
- Authority and plan: Requirements §§6–8; slices C and D. See [[roadmap]] and [[analysis]].

<!-- grreat:record id=goal.assurance kind=goal role=goal status=active level=2 parent=goal.north-star -->
## Judge evidence and promote valid compositions

- Outcome: Authorized verifiers evaluate exact candidate versions; reviewers compare or compose Things against one acceptance contract and promote only under deterministic policy.
- Acceptance: Protected oracles cannot be rewritten by implementers. Missing/stale evidence, unauthorized edits and incompatible compositions block promotion; changing a selection recomputes affected checks and stale-base CAS rejects races.
- Current boundary: Deterministic local/hosted code paths and single-candidate promotion are locally verified; generic candidate comparison/composition and live provider evidence remain open.
- Authority and plan: Requirements §§3.1–3.3, 8–9; slices E and F. See [[roadmap]] and [[analysis]].

<!-- grreat:record id=goal.workspace kind=goal role=goal status=active level=2 parent=goal.north-star -->
## Make the whole World journey understandable

- Outcome: Invited collaborators can move from intent and model creation through work, evaluation, promotion and observation in the six revision-pinned views.
- Acceptance: Creation/proposed edits, real concurrent Work, Theory evidence and candidate composition are usable; Visual/Text selection, keyboard access and canonical/candidate/deployed distinctions survive navigation.
- Current boundary: The shell, local candidate flow, ontology lab and advisory impact are verified. The full generic creation and multi-Move journey is incomplete.
- Authority and plan: Requirements §10; slices A, C, F and G. See [[roadmap]] and [[analysis]].

<!-- grreat:record id=goal.hosted kind=goal role=goal status=active level=2 parent=goal.north-star -->
## Prove the platform and realized app on Cloudflare

- Outcome: Invited collaborators use the hosted platform, and an authorized owner publishes a verified full-stack application Thing to a dedicated Worker through a connected Cloudflare account.
- Acceptance: Verify platform provisioning and identities, isolated Artifacts source/forks, private OAuth grants, exact retained bytes and live A→B→rollback. Rollback changes runtime publication while canonical B remains unchanged.
- Current boundary: Hosted adapters/workflows are locally verified; repository mirroring is live verified. Hosted platform/application release and owner OAuth flow remain unverified.
- Authority and plan: Requirements §§7, 9, 11–12 and hosted scope in the decision log; slice H. See [[roadmap]] and [[analysis]].

<!-- grreat:record id=goal.assistant kind=goal role=goal status=active level=2 parent=goal.north-star -->
## Demonstrate useful goals, calendar actions and learning

- Outcome: The example World clarifies intentions into goals and next actions, places linked task blocks on a connected calendar, replans within Automatic rules and reviews attributable progress.
- Acceptance: Qualify the operation/permission contract first; preserve unrelated events and overrides, reconcile retries/external edits and expose partial failure. Observe goal criteria separately from elapsed time, completion reports or synthetic metrics.
- Current boundary: Purpose and broad workflow are accepted; provider and detailed criteria remain unresolved. Synthetic examples and usefulness benchmarks do not establish real assistant benefit.
- Authority and plan: Requirements personal-assistant example, §§4 and 12; slices B, I and J. See [[roadmap]] and [[analysis]].
