# World Platform Plan and Requirements

We are building a platform for people and agents to define Worlds with a purpose in their Environment, realize changes concurrently, evaluate implementations and outcomes, and decide what becomes canonical. The shared model preserves intent, structure, causal hypotheses, implementations and observations across multiple Things. Git and Cloudflare Artifacts provide versioned storage; our platform provides the collaboration and realization protocol.

## Authority and accepted release decisions

This Markdown document is the canonical, editable plan and requirements. It was converted on 2026-10-08T00:39:47-04:00 from the unchanged [Word source snapshot](../world-platform-plan-and-requirements.docx) (SHA-256 `57aac97fd48a388a3b64ab3baec0977f30b637165bb40da88552fd1e41943e06`). The Word file is a historical source snapshot, not a second editable authority. The initial conversion preserved source content; this canonical text now incorporates subsequent user decisions. Later changes should update this document and retain decision history in [the decision log](decision_log.md).

- Plan and execute by dependencies and acceptance criteria, without timelines. The competition date in section 1 is retained as source context and does not govern the roadmap.
- The first deployed version serves invited collaborators and their local agents.
- A personal assistant World anchors initial end-to-end acceptance.
- The independently versionable domain component is named **Thing**, distinct from the **Cloudflare Artifacts** storage product.
- LFP and UIP provide exploratory evidence; this document governs the first Cloudflare-deployed version.

Provider capabilities and the source document's reported reference-verification date have not been independently reverified during this adoption. Verify the relevant integrations before relying on them in implementation.

## Personal assistant example World

The assistant’s accepted Purpose is to improve the user’s life by connecting to external systems, interacting with the user and organizing the user’s information. The user and their needs, information sources and connected services form its Environment.

GRREAT supplies design inspiration for goal-linked planning, execution, evidence and review. The assistant’s concrete domain, external connections and implementation remain to be defined. Its user-facing goals and information are domain content inside the example World, distinct from Bropilot’s own project tracker and realization protocol.

The accepted first workflow covers organizing goals, identifying next actions and reviewing progress. Conversation clarifies intentions; structured goals and plans make the next action visible; progress review uses reported or observed evidence to revise the plan. Routine changes to goals, plans and organized information use Automatic mode under explicit rules. Calendar connection, goal breakdown and placement of task blocks on the calendar provide the concrete example. Scheduling the user’s activities is a product capability; it does not introduce a delivery timeline for Bropilot. Draft scenarios and routine-change rules are recorded in Research. Their detailed acceptance contract and the calendar provider remain to be specified; research and proposals are tracked in [GRREAT Research](grreat/research.md).

## 1 Purpose and system boundary

The central collaboration flow is **World → Move → Realizations → Evaluations → Promotion**, with observations feeding revisions to the World and its Theory.

A World models the system we construct and can span repositories, services and non-code material. Its Environment models the surrounding context; its Purpose defines the intended change in that context. A Move is the unit of collaborative change.

The minimum version supports agents running locally through any compatible CLI harness. Users choose agent providers, roles, number, execution environment and orchestration outside our platform.

Our platform supplies tasks, context, isolated workspaces, permissions, coordination, checks, evidence and decisions. It must support multiple agents working concurrently without requiring platform-hosted agents.

Hosting implementation, review or repair agents on the platform is optional. Engineering concerns enter through reusable Kits and Rule Packs feeding one conformity engine.

The competition requires Workers and Artifacts, concurrent agent work, a 5–10 minute demonstration, permissively licensed source and instructions for trying the project. Submissions close October 14, 2026. [1]

## 2 Core objects

**World.** The system we construct: an application, product, document system, campaign or other intervention. It contains Things, relationships, policies and a stated Purpose relative to one or more Environments. Record its boundary, what it controls, what it can influence and what remains external. A World may begin with only its Purpose and an incomplete model.

**Environment.** A typed component instantiated or referenced through a World or Thing template. It models users and beneficiary groups, their needs and behaviours, third-party surfaces, organizations, other systems, resources and operating conditions. Its objects have stable identities and links to interfaces and Theory claims. Preserve provenance, assumptions, observations and uncertainty. Shared Environment models may be referenced by multiple Worlds; the model does not control external reality.

**Purpose.** A typed component whose shape and requirements are defined by the template. It states whose need is addressed, the intended change in the Environment, why it matters, constraints and success criteria. Link it to beneficiaries, outcomes and indicators in the Theory. Thing templates can inherit or refine the World's Purpose. Changes are versioned without redefining historical success.

**Thing.** An independently versionable part of a World: a frontend, backend module, database schema, document, campaign or external service. Most managed Things use Cloudflare Artifacts repositories; external Things use adapters and explicit references. A domain Thing is distinct from the Cloudflare Artifacts storage product.

**Ontology.** A typed definition of allowed entities, properties, relationships, operations and constraints. The platform's system ontology defines World, Thing, Template, Purpose, Environment, Ontology, Theory and the realization protocol itself. World and Thing templates specialize that ontology and include a domain ontology, such as routes, APIs, data entities, roles and external interfaces for a webapp. Their instances contain the corresponding content and relationships. The Theory expresses expected causal links among those instances.

**Template.** A versioned, reusable specification of a World or Thing type within the system ontology. It defines the shapes, relationships, required fields, defaults and constraints for Purpose, Environment, domain Ontology and Theory, alongside rules, acceptance conditions and lifecycle extensions. Creating a World or Thing instantiates this structure. Thing templates can inherit shared context by reference and refine it locally; composition validates compatibility with the containing World. These components are part of the template's model, rather than independent attachments.

**Theory.** A typed, versioned component defined by the template, expressing how the World or Thing should contribute to its Purpose in its Environment. A logic model links inputs, activities, outputs and outcomes; hypotheses describe mechanisms, beneficiaries, assumptions, external influences, risks and unintended effects. Link claims to indicators, evaluation methods and observations. Representing a causal link does not establish its truth. [12]

**World Revision.** An immutable manifest pinning Template versions, Thing revisions, domain ontology versions, Purpose, Theory, referenced Environment model revisions, Genome, Rule Packs, Assays and configuration. Separate desired revisions from realized compositions and deployed instances. Branching a World branches its manifest; unchanged Things can remain shared by reference. Selecting parallel Things creates a composition requiring validation. Pinning or branching an Environment model does not freeze or duplicate actual users and external systems; observations retain their time and context.

**Move.** The requested change and its reason. It records intent, base World Revision, desired semantic delta, affected ontology nodes and Theory claims, expected contribution to Purpose, dependencies, invariants, acceptance criteria, required evidence, authorized roles and scope, risk, candidate Realizations and final decision. It is the reviewable change object replacing a purely file-oriented pull request.

**Realization.** One concrete attempt to satisfy a Move against a pinned desired revision and base composition. Multiple agents may produce competing Realizations of the same target or complementary Realizations of different Moves. Record its agent identity, workspace repositories, commits, implementation changes, execution status and evidence. Submission pins an immutable implementation version for each affected Thing; changing its content creates a new candidate version whose applicable Assays must be reassessed.

**Evaluation.** A versioned assessment of a Realization, composition or deployed World against requirements, rules or Theory claims. It contains the question, method, observations, interpretation, limitations and result. Record claim and Assay IDs, source and configuration hashes, execution and deployment context, Environment objects or groups observed, verifier identity, timestamps and supporting evidence. Preserve raw observations separately from conclusions. Results may establish conformance, support or challenge a hypothesis, or remain inconclusive.

**Promotion.** A policy-authorized decision making a validated Realization or composition the canonical World Revision. Record the selected candidates, rejected alternatives, evidence, approver or policy and rationale. Deployment and rollout remain separate actions.

## 3 Representation and reality

| **Layer** | **Meaning** |
| --- | --- |
| Genome | Desired semantic state: Purpose, ontology instances, Theory claims, requirements, specifications, invariants and acceptance criteria |
| Proteome | Executable realization: source, configuration, infrastructure, migrations and workflows connecting the model to reality |
| Reality | The realized World interacting with actual users, external surfaces and conditions represented by its Environment |
| Phenome | Observed behaviour and effects: responses, latency, traces, errors, user behaviour, output and outcome indicators |
| Assays | Tests, assertions, monitors, benchmarks, probes and evaluation procedures that produce observations against rules or Theory claims |

Assays inspect implementation contents in the Proteome and produce runtime observations about the Phenome; Evaluations interpret those observations against explicit questions. Every supported claim must identify its evidence. Conformance asks whether the World behaves as specified; outcome evaluation asks whether it produces the intended change for its Environment. Passing implementation checks does not establish an outcome or causal effect. Missing or insufficient observations remain unknown.

### 3.1 Acceptance criteria, Assays and execution hooks

An **Acceptance Criterion** is a versioned proposition attached to a World, Thing, operation or Move. An **Assay** specifies how to obtain evidence for that proposition. Its **execution hook** binds the protected Assay definition to a versioned runner, executable or model procedure. The hook is part of the acceptance contract, not an implementer's free-form success assertion. Resolve it through authorized, versioned runner bindings; candidate material cannot replace protected Assays. Execute candidate code with isolated, scoped capabilities and the declared resource limits. A criterion may require several Assays, or an explicitly declared alternative; record their combination policy rather than treating any single pass as sufficient.

An Assay contract records stable ID/version and linked criteria; subject and applicable scope; method (`deterministic`, `decision-model`, `LLM` or an explicit combination); executable/runner or model/prompt/rubric references and hashes; inputs and prerequisites; assertions or interpretation policy; verifier capability; required/advisory role; trigger/selection policy; time/resource/spend limits; evidence format and freshness/reuse rules. Declaring a hook establishes coverage, not that its test has run. Readiness checks that required bindings and policies resolve; candidate verification executes them.

A **Thing implementation version** identifies concrete material realizing that Thing: storage/repository and immutable source commit, plus build/configuration manifests and output digests when produced. A full-stack Worker application can be one Thing whose version includes its Worker entry, frontend assets and runtime configuration; splitting frontend and backend into separate Things is optional. Repository identity alone does not identify a version. Source, build output, preview/deployment and observations retain distinct identities and traceable bindings.

A submitted Realization binds Move ID, desired revision and base composition, candidate ID, affected Thing implementation versions and acceptance-contract hash. Verification pins that submission and an execution-plan hash before starting. Later changes to source, composed dependencies, configuration, Assays or interpretation policy invalidate affected evidence; they cannot silently inherit a previous candidate's pass.

### 3.2 Verification levels and selective execution

Order verification by prerequisites and cost while keeping **method, cost, evidence strength and promotion requirement separate**. A costly deterministic browser/integration test can need selection just as an LLM check does; a cheap model judgment does not become a hard factual oracle because it is inexpensive.

| Level | Example Assays | Default execution policy |
| --- | --- | --- |
| Basic deterministic inspection | Resolve an immutable implementation version; verify required contents, hashes, scope and configuration shape | Run for every admitted submitted version under bounded intake limits |
| Deterministic execution | Build the candidate, start its Worker, probe health/API/static assets, run unit/integration/browser checks | Run applicable bounded smoke checks after inspection; reserve substantial suites for candidates selected by explicit policy |
| Semantic assessment | A decision model judges a bounded proposition; an LLM evaluates a rubric with relevant source/runtime evidence; a declared pipeline combines them | Run only for selected candidates with authorized budget and the required prerequisite evidence |
| Deployed observation/outcomes | Recheck the promoted deployment and collect observations against Theory indicators | Separate lifecycle trigger; candidate conformance does not establish deployment or beneficiary outcomes |

A versioned verification policy selects candidates, Assays and budgets using explicit conditions: prerequisite results, semantic scope/risk, owner selection or funded contributor request. Record the selection reason and exclusions. For a combined model procedure, pin each model, prompt/context, rubric, threshold and combination rule; retain judgments and uncertainty. Deterministic policy decides the next action from these results. A semantic pass cannot override a failing hard assertion.

Keep execution states (`queued`, `running`, `completed`, `not-selected`, `awaiting-funding`, `cancelled`, `error`) separate from assessment (`pass`, `fail`, `inconclusive`, `unknown`) and evidence trust. Not running an Assay does not produce a pass. A required Assay without acceptable current evidence blocks promotion even when it was omitted for cost. Policy changes or permitted waivers must be separately authorized and attributable.

### 3.3 First candidate-verification example: a Worker web app

The next hosted slice keeps the full-stack app as one Thing backed by one canonical Cloudflare Artifacts repository and one dedicated target Worker. Isolated Realization forks remain workspaces of that Thing. Source repositories, retained verified packages and evidence reside in the platform account; separately authorized deployment uses the user's OAuth-connected Cloudflare account. Legacy inline-source Worlds remain local-only until explicitly imported and reverified. Canonical promotion is a Rust compare-and-swap decision; protected Git main reconciliation has durable current/pending state, an owner retry operation, and must succeed before normal deployment dispatch. A verifier lease reserves one immutable package upload before R2 writes, so conflicting retries cannot create additional package objects.

Hosted publication consumes the exact retained module, assets and deployable configuration bound to a successful trusted Evaluation; it never rebuilds or resolves mutable source refs at deployment time. World-head promotion is atomic in the World authority; Git branch reconciliation and deployment are separate, retryable actions. A target coordinator fences provider writes and freezes uncertain publication until reconciliation. Runtime health observations remain separate from publication success and beneficiary outcomes. Explicit rollback selects a previously retained verified version and does not change the canonical World head.

This platform acceptance example complements the personal-assistant World; it does not replace that selected domain or require calendar connectivity to test the generic realization protocol.

1. Define Thing `web-app`, its Worker application Template/Kit and a Move to realize its initial implementation. The desired model links each criterion below to protected Assays and declares the relevant composition, permissions and verification policy.
2. An authorized person or agent submits an immutable source version realizing the Move. A platform-controlled verifier resolves and checks that exact version; self-reported test results remain separately attributed.
3. The runner builds it and starts the resulting full-stack application in an isolated preview with declared test bindings. It records the source/build digests and the actual instance tested. Candidate-controlled response fields alone cannot attest which version was started.
4. Run the linked assertions and publish raw observations and criterion assessments. Compare or repair candidates; only an authorized promotion decision changes the canonical manifest. A preview is not a production deployment.

| Criterion | Protected deterministic hook and evidence |
| --- | --- |
| The web-app implementation exists | Resolve the submitted repository/immutable commit and required Worker/frontend/configuration contents; compare manifest/digests. A network or permission failure is an execution error with unresolved assessment, not invented evidence of absence. |
| The implementation builds and starts | Build the pinned inputs and start the output under the declared Worker runtime/configuration; capture exit status, output digest and runner-owned instance identity. |
| The running app serves its declared health contract | Probe the exact preview's `GET /health` within a bounded deadline; assert HTTP 200 and a declared JSON schema, for example `{ "status": "ok" }`. Keep request/response evidence and execution context. This establishes only the specified health property; dependency health requires its own assertions. |
| It serves the full-stack surfaces declared by the Kit | Probe the frontend entry/static assets and a declared backend route against their contracts on that same instance. Artifact presence or a standalone health route does not establish these properties. |

The minimum implementation slice must also prove failure and freshness: a missing implementation fails inspection, a broken health response fails its criterion, a changed candidate cannot reuse old results, retries do not duplicate runs, and missing required evidence blocks promotion. Add model-based assessment and contributor funding after this deterministic submission → verification → evidence path works.

### 3.4 Advisory personal-assistant change impact

The normal World workspace compares saved revisions or a bounded hypothetical edit and explains affected Things, criteria, Assays, metrics and evidence. Fixed typed Templates remain the ontology language; compiled `assistant-impact@1` Ascent rules derive consequences. This is advisory analysis: no canonical write, evidence mutation, Assay acceptance or promotion-policy change. The personal assistant remains the example; sample work and observations are clearly synthetic.

Compare actual model contents deterministically, including meaningful titles and provenance. A revision label alone is not a domain change; a changed Thing revision seeds its owned objects. Evaluate baseline and proposed dependency closures separately, retain baseline/proposed/both attribution and shortest lexical witnesses, and show removed baseline nodes as ghosts. `dependsOn(dependent, dependency)` establishes functional direction. Explicit factual `covers(assay, object)` and `verifiedBy(criterion, assay)` attribute affected coverage; ownership and containment are navigation. Proposals, assumptions and hypotheses do not establish dependency facts. Complete absence guarantees require explicit `impact-dependencies`, `impact-criterion-coverage` and `impact-metric-lineage` declarations; incomplete scopes retain known impacts and explain unknown coverage.

Evidence input digests, relation digests, Thing revisions, Assay definitions and Rule Pack pins determine `inputsMatch`, `needsRecheck` or `unknown`, separately from synthetic/unverified/server-resolved provenance. Provided binding strings never establish verifier acceptance. Existing source-only Assay evaluations lack ontology bindings and remain unknown; historical evidence stays immutable.

Evidence applicability answers whether recorded inputs still match the compared model. It does not change a historical pass/fail result or establish that the Assay adequately tests the affected behavior. A change may require three evidence rechecks while leaving a recomputed metric unchanged; present these as distinct consequences.

The fixed metric is unique completed/planned tasks in an explicit UTC reporting window (inclusive start, exclusive end). Its baseline excludes cancelled plan items; its one variant includes them. Typed digest-bound plan items and completion observations are projected from snapshot objects, never free numeric inputs. Reject conflicting duplicate identities; zero denominators and incomplete coverage remain unknown. Show counts, input references, definition/window comparability and applicable deltas.

Distinguish a metric-definition change from a correction to recorded activity and from observed behavior improvement. Changing which tasks enter the denominator can make values incomparable; correcting a completion timestamp can change a comparable value without showing worse follow-through. A value derived from synthetic records demonstrates calculation behavior, not a beneficiary outcome.

Rust owns `changeImpact` queries, report contracts, inference, metric projection and typed patch application. The Worker authorizes and loads saved inputs as for a pinned revision, creates a unique hypothetical revision identity and content hash, and invokes core without writes. `POST /api/v1/worlds/:worldId/analysis/change-impact` accepts a baseline revision and a saved target or bounded typed patch; it returns the report and compared snapshots. Admitted edits cover Thing revision, approved semantic properties, explicit dependencies, criterion/Assay links and the fixed metric definition, never arbitrary JSON, schemas or rules. Missing compiled packs produce explicit not-configured errors. Raw public domain queries treat both supplied models as unverified, force hypothetical draft identity and downgrade evidence provenance; only the authorized revision analysis endpoint resolves saved inputs.

Map’s Analyze change opens a comparison panel with inspector explanations and proof highlighting. Lead with a concise consequence summary, then separate actual model edits, potential effects, recomputed metric values and evidence to revalidate. Count submitted edit operations separately from resulting model differences. Prioritize useful consequences by Thing and governing criterion/Assay while retaining the complete affected-object list on demand. A Thing revision change is the explanation’s actual trigger; its unchanged owned objects are propagation seeds, not direct edits. Proofs begin with that revision change and continue through the exact attributed witness.

Draft memory is scoped by baseline hash; draft payloads stay out of URLs. Edits make old reports stale, explicit Analyze reruns, and request fencing discards stale responses. Resource guards include existing snapshot limits, 20,000 derived pairs, 250,000 seed × (nodes + eligible edges) work units, 100,000 witness references and a 1 MiB report.

## 4 Ontologies Theory and engineering Kits

Rules attach globally or to specific ontology sections. Versioned Rule Packs group concerns such as security, authentication, observability, accessibility, performance and Cloudflare production readiness. Conflicting requirements or incompatible pack versions block actionability until resolved.

A **Kit** packages a World or Thing Template with compatible Rule Packs, implementation scaffolding, standards, examples, Assays, semantic decision questions, context mappings and execution instructions. The Template defines the model; the Kit supplies reusable means to populate, validate and realize it. Pack rules may require telemetry, access controls, feature flags, deployment records or thresholds; integrations provide those capabilities.

The Theory must connect each intended outcome to beneficiary groups, relevant World activities or capabilities, causal hypotheses and assumptions. Record an indicator, baseline where available, target or expected direction, time horizon, data source and evaluation method. Keep outputs, such as a delivered feature, distinct from outcomes, such as users completing a task more reliably. [12]

Separate enforceable invariants from empirical hypotheses. A causal claim records its rationale, available evidence, alternative explanations and conditions under which it may fail. Evaluations may support, challenge or leave it unresolved; causal attribution requires a suitable study or comparison, not just a metric moving. Learning creates a proposed Theory revision. Requirements concerning measurement or experiment integrity may be hard rules even when the outcome is uncertain. [13]

Actionability requires the Theory detail appropriate to the Kit and Move. It can require a measurement plan before implementation without requiring a future outcome to have already occurred. Promotion uses explicit conformance and risk policy; later outcome evaluation informs maintenance, evolution or a new Move.

The conformity engine must:

Validate schemas, types, required fields, references, relationships and declared deterministic constraints.

Identify contradictions, missing decisions, unresolved dependencies and incomplete acceptance coverage through explicit checks and bounded semantic review.

Trace Purpose to Theory claims, Environment objects, requirements, components or source where known, and to Assays and Evaluations.

Cover realistic user flows, negative cases, cross-Thing contracts, permissions and relevant regression behaviour.

Report **pass, fail, unknown, stale or waived**, with provenance. Waivers require explicit policy, scope, reason and expiry.

Version Templates and their ontology, Purpose, Theory, Environment models, rules and Assays; propose changes without silently weakening an approved contract.

## 5 Model consistency correctness and minimum completeness

Before realization, validate the instantiated World model against its Template, selected Kits and Move scope. Combine a typed relational model, declarative inference and constraint checks, and bounded semantic judgments. The result is a versioned **Readiness Evaluation** showing what is consistent, what is correctly specified under the declared contract, what essential information is missing and what remains uncertain.

Represent model content as typed objects and relations with stable IDs, sources and revision references. Distinguish declared facts, assumptions, hypotheses, model proposals, observations and derived facts. Templates define required relationships and minimum completion obligations; rules derive dependencies, applicability, coverage and violations across that structure.

**Ascent** is the current inference engine: a Datalog-like logic language embedded in Rust, with relations, recursive inference, stratified negation, aggregation and support for custom backing data structures. It is more than a data structure. Our persistent model stores the facts; an Ascent-style engine evaluates approved declarative rules over a pinned snapshot. The current Rust/Workers implementation uses Ascent for transitive dependency reachability and forbidden-cycle detection; schema, reference, completeness, required-link and named-constraint checks are implemented in Rust. These checks do not establish semantic entailment, relevance or the truth of permission text. [14]

Declarative checks must derive obligations and detect violations, for example:

A Purpose must identify its intended beneficiary and outcome; the beneficiary must resolve to an Environment object of the required type.

An outcome must have the indicator and evaluation plan required by its Template. Missing links are completion gaps; absent future observations do not make an unrealized World invalid.

Every in-scope operation must satisfy its applicable authorization rules, including obligations inherited through interfaces and dependencies.

Every required acceptance criterion must have an Assay or explicitly permitted evaluation method. Referenced objects, contracts and versions must resolve and be compatible.

Conflicting permissions, incompatible constraints, forbidden dependency cycles and unresolved required decisions produce explicit blockers. Cycles are invalid only where the Template forbids them.

**Decision models** handle meaning that explicit rules cannot yet resolve: classifying statements, linking them to candidate ontology types, judging ambiguous contradictions, or identifying an underspecified outcome or criterion. System 1 models return typed choices, scores or yes/no probabilities; they propose interpretations and review signals. Deterministic policy controls whether a proposal becomes an accepted model fact. Reasoning models or people handle uncertain cases and synthesis. [2–4]

The local authoring lab uses Codex for proposals, fixed Rust/graph checks, optional bounded Jev 1.13.0 semantic review, and local gpt-6-luna for questions grounded in current findings. Semantic review covers claim support, relation relevance, contradiction, permission scope and question usefulness/answered status. Exploring, defining and realizing stages change conversational priority only; Rust readiness and authorization remain unchanged. Model judgments are provisional, retain uncertainty and never authorize actions or establish executed Assays. The local credential stays in the runner; hosted authoring remains deferred. The [ontology usefulness benchmark](../packages/ontology-lab/benchmark/README.md) records actual extraction, question quality and semantic-judgment evidence. A graph-ready result alone is insufficient evidence of correct interpretation or useful assistance.

The readiness process is:

1. Instantiate the Template and normalize accepted content into typed facts and relations.

2. Validate schemas and references; infer applicable obligations and dependency closure under the declared rules.

3. Assess unresolved semantic questions with relevant context and explicit candidates. Record model answers, uncertainty and required review.

4. Apply approved clarifications, rerun affected rules and emit errors, missing information, warnings and obligations with references to the contributing facts and rules.

5. Mark the exact revision and Move scope actionable only when its required obligations are satisfied and no blocking violation or unresolved mandatory decision remains.

Minimum completeness is defined by the selected Template and scope, not by a generic score or a claim to know everything. Consistency and correctness are relative to explicit rules and accepted facts; the process cannot prove empirical hypotheses or future implementation behaviour. Missing information is unknown unless a completion rule explicitly requires it. Use negation only over declared complete relation scopes when treating absence as a violation.

Fixed typed Templates define what can be expressed; compiled Ascent rules derive consequences from accepted facts in that language. Reachability establishes potential impact under the authored dependency model, not observed causation. A completeness declaration is an explicit assumption about coverage, not proof that the author found every real dependency. The analyzer cannot discover omitted dependencies or establish test adequacy from those declarations; qualify absence guarantees and retain unknowns when scope is incomplete.

Pin the Template, fact snapshot, rule versions, accepted interpretations and model versions in the Readiness Evaluation and Task Packet. Retain provenance for derived findings, test rule sets against known valid and invalid models, and validate semantic thresholds on held-out cases. Bound execution and treat incomplete inference as unknown. Recompute after relevant changes; cached judgments depend on exact inputs. The same model supports later context selection, semantic conflict analysis and runtime drift checks, while permissions and promotion remain under deterministic policy.

## 6 Immediate context for every agent

Our structured Things are reusable context. Maintain versioned ontologies, Purpose, Theory, Environment models, specifications, Rule Packs, Assays, architectural decisions, interfaces, dependency maps, source mappings and Evaluations. Cloudflare recommends isolated repositories and forks from trusted baselines, which supports this handoff model. [5]

Before execution, the platform compiles a **Task Packet** for the assigned role containing:

1. World, Move and Realization IDs; pinned Template, model revision and Readiness Evaluation; intent, Purpose contribution and acceptance criteria.

2. Relevant ontology nodes, Environment objects, Theory claims, relationships, contracts, invariants, Kit versions, assumptions and unresolved questions.

3. Authorized workspace repository URLs and pinned commits; permitted changes; protected material; credential acquisition and expiry instructions.

4. Ranked entry files and symbols, expected edit locations, affected dependencies and a wider read context. Each mapping carries its source and certainty; unfamiliar code is explicitly marked for discovery.

5. Setup, build, test and preview commands; required Assays, measurement instructions and Evaluation format.

6. Relevant previous decisions, failures, observations and concurrent work; the rules for requesting broader scope or resolving interference.

7. Submission instructions, status reporting, checkpoint format and the next action expected from that role.

Expose this through a downloadable skill or agent instruction file and a stable machine-readable CLI/API contract. Agent-specific skill formats are adapters. A skill initiates the protocol; it is not the security boundary.

Start with deterministic graph traversal and pinned source mappings; optionally use semantic retrieval and System 1 ranking. Always include applicable hard rules and contracts even when ranking gives them low relevance. Disclose why context was included and provide on-demand expansion to authorized material.

Update source mappings when implementation changes. Checkpoints preserve what changed, why, remaining work and evidence references so another session or agent can resume. Handoffs are role-specific: implementation, Assay authoring, verification, review and repair receive different tasks and capabilities. A repair packet includes the failing rule, reproducible failure and relevant context.

Immediate context means an agent receives a prepared starting point. It must still inspect uncertain mappings and validate assumptions. Packet versions and hashes make stale handoffs detectable.

## 7 Lifecycle

1. **Empty World:** choose or define a World Template, instantiate its Purpose, Environment, domain Ontology and Theory, and add Things through their Templates.

2. **Unrealized World:** extract conversation into a desired revision of the World, Purpose and Theory, linked to Environment objects. Preserve intent, hypotheses, assumptions and open questions.

3. **Actionable Unrealized World:** a Readiness Evaluation confirms consistency, correctness under the declared model contract and minimum completeness for the Template, Kit and Move scope. Required rules, Assays, dependencies and permissions are in place.

4. **Parallel realization:** register task roles, prepare packets and fork implementation Things. Local agents claim work, act independently, checkpoint and push candidates.

5. **Verification:** observe repository changes, run checks and record Evaluations against exact candidate compositions. Reviewer or repair roles may be local or hosted.

6. **Selection and composition:** compare competing Realizations or combine compatible changes across Things. Revalidate the resulting composition and resolve conflicts.

7. **Promotion:** apply policy, obtain required approval and atomically advance the World head to an immutable manifest.

8. **Deployment and observation:** action the promoted revision, record release state, observe behaviour and outcome indicators, and detect drift or changed Environment conditions. Findings can initiate a Move.

New intentions create new desired revisions and Moves. Earlier realized revisions remain reproducible references. Multiple realized candidates may share the same Genome while having different implementations and observations. This is the core realization protocol, not a closed list of lifecycle phases.

Allow Kits to define later or recurring phases such as maintenance, experimentation, evolution, deprecation and retirement, with their own responsibilities, entry and exit conditions, policies, Assays and transitions. Record phase separately from specification readiness, candidate status and deployment state. A maintained World can have several Moves being realized while outcome evaluation continues. The minimum version stores phase identity and history; future phases reuse the same protocol without requiring a complete lifecycle engine now.

## 8 Concurrency and promotion

Use a repository per autonomous task or Realization when lifecycles differ. Branches remain available for collaborators sharing a lifecycle. Preserve agent isolation and allow independent candidate comparison. [5]

The platform tracks ontology nodes, operations, contracts, Theory claims, Environment assumptions and dependency edges alongside file diffs. Changes can interfere through a shared user journey or outcome hypothesis even when their files differ. Overlap signals analysis; it does not itself prove a conflict.

| **Conflict class** | **Meaning and handling** |
| --- | --- |
| File conflict | Patches cannot combine mechanically; resolve the file changes |
| Hard semantic conflict | Declared requirements, contracts, constraints or capabilities are deterministically incompatible; block until resolved |
| Evidence conflict | A candidate or composed World fails an applicable Assay; repair or reject |
| Soft semantic conflict | A model predicts interference; require additional evidence or review |

Compare candidates against the same relevant acceptance contract. Validate combined Things as a composition; individually passing candidates are insufficient. For example, guest authorization and bulk deletion can conflict through the shared delete capability even when Git merges cleanly. This illustrates semantic checking, without prescribing the competition implementation.

Promotion atomically changes the manifest, not every repository or external system. The World authority must compare the expected base head with the current head, reject stale promotion, and revalidate affected compositions when other work lands. Make claims, event handling, verification and promotion idempotent; tolerate duplicates, retries, delayed events and abandoned agents.

The World authority owns canonical state. Move coordinators may manage claims and candidate status, but cannot bypass World promotion policy. Claims help coordination; capabilities enforce authority. Failed or expired claims do not confer promotion rights.

## 9 Assurance and permissions

Separate specification authoring, Assay authoring, implementation, verification and promotion as roles with independent provenance. They may use different local agents; the platform does not prescribe their count. Multiple agents using the same model do not automatically provide independent assurance.

Define acceptance criteria and protected Assays before implementation where practical. Implementers receive the contract but cannot rewrite the protected oracle or declare their own evidence trusted. Record who produced and verified each result; distinguish self-reported local results from evidence produced by an authorized verifier. Prefer deterministic execution checks over model judgments when behaviour is testable.

An agent capability specifies World, Move, Realization, role, readable Things and Environment data, writable workspace repositories, operations, scope and expiry. Changes to Purpose, Theory, Environment models, Genome or rules, and verification or deployment, require explicit authority. Repo-scoped, short-lived tokens support storage isolation. [5, 6]

Cloudflare repo tokens do not enforce file-level or semantic permissions inside a writable repo. Separate protected material into read-only repositories, validate candidate diffs against scope, and block promotion of unauthorized changes. CLI instructions alone cannot enforce permissions on a user's computer. Production secrets and authority must stay behind independently authorized services.

Approval scales through risk and evidence. A low-risk, independent change with current required evidence may auto-promote under explicit policy. Security-sensitive changes add relevant packs and review; migrations may require human approval; destructive production actions may require two-person approval. These are configurable policies, not blanket approval for every task. Required approval expiry or absence blocks the dependent action. Workflows can durably wait for an approval event. [7]

### 9.1 Optional contributor-funded verification

An open-source World may let contributors request platform-run Assays for their own candidates and fund the associated execution. Funding buys the declared verification service, not a passing result, protected-oracle changes, broader capabilities or promotion authority. Apply the same pinned contract and verifier trust policy regardless of payer. Open-source submission/funding is an extension to the initially invited-collaborator release, not a new release audience requirement.

Bind a quote/funding authorization to World, Move, candidate/composition digest, verification-plan hash, requester, selected checks, currency/units, maximum amount and expiry. Show the expected work and charge policy before expensive execution. Keep funding/settlement status separate from execution and assessment. Define cancellation, failed-run charges, refunds and unused-budget handling for the chosen payment method; no automatic refund behavior is assumed.

A payment adapter may use HTTP `402 Payment Required` and header-based challenge/authorization/receipt exchange. Cloudflare documents x402 and MPP support; x402 uses `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE` and `PAYMENT-RESPONSE` headers. These are provider options, not a selected integration. Cloudflare Monetization Gateway currently documents closed-beta access and United States buyer/seller eligibility, so its availability cannot be assumed. [15–17]

Verify funding with the payment adapter before dispatching funded work; a caller-supplied header is not proof of payment. Deduplicate request/retry and payment-event processing using a bound run identity and verified receipt/authorization; do not start another paid run or charge twice because a response was lost. Record partial failure for reconciliation when payment and job acceptance cannot commit atomically. Expose an authorized, resumable run/status receipt for asynchronous checks rather than requiring the payment HTTP request to stay open until all tests finish. Settlement, quotas and candidate access remain independently enforced.

## 10 World Map and control panel

An isolated ontology-authoring lab accepts messy descriptions and follow-up chat, proposes typed/provenance-bearing draft objects and relations, and runs the authoritative criteria/readiness checks. Keep the ontology central, processors in a floating mini panel and event logs in a right sidebar. Selecting or stepping through a recorded event restores its draft checkpoint and highlights the input, processor, objects, relations or findings involved. Distinguish live model extraction, deterministic mapping and Rust checks from example replay; feedback points to actual findings and unresolved information. Draft lab runs do not modify canonical Worlds or execute calendar/deployment effects.

The authoring assistant should surface sensible, thoughtful questions with a calm, curious voice. Lead with one useful next question and its reason, preserve what the user has already supplied, and keep additional questions optional. Short replies retain their question context. Assistant suggestions and questions provide context, never authoritative user facts; accepting an interpretation remains distinct from proving runtime behavior or outcomes.

The UI must help a user decide what to build, understand why it matters, coordinate work, judge candidates and learn from outcomes. Start from a spacious blank canvas and keep the main experience centered and delightful. Every visible component must serve the current action; do not ask users to re-enter choices already settled in the plan. Provide Overview, Map, Theory, Work, Evaluations and History views. Keep World and revision context accessible through quiet switching controls, with Environment, phase, search and canonical/candidate/deployed distinctions revealed where they help the user understand or act. Detailed evidence and the shared inspector appear on demand rather than occupying the default canvas.

The Overview centers the Purpose and the next useful action. Beneficiaries, outcomes, readiness, deployment, phase, active Moves, blockers and decisions remain accessible in context, with detail revealed on demand. Separate model readiness, implementation conformance and outcome progress. Show timestamps and unknown states; link each status to its rule, claim, Evaluation or next action. An unresolved model obligation is distinct from a failed build or an untested outcome hypothesis.

The Map offers a Visual / Text toggle that preserves the same selection and pinned context. The visual layout takes focus-centered spatial navigation cues from UIP while retaining a clean, spacious canvas; Text provides the readable hierarchy. It supports semantic zoom through World, Thing, subsystem and operation, with the surrounding Environment and a clear system boundary. Offer structure, causal relationships, change activity, risk, observed reality and candidate overlays as distinct views of shared objects. Use a focused diagram with breadcrumbs, filtering, search and a synchronized hierarchy; preserve selection when changing views. Keep relationship direction, type and uncertainty visible.

The Theory view connects Purpose and beneficiary groups to activities, outputs, outcomes and causal hypotheses. Selecting a link reveals its mechanism, assumptions, indicator, evaluation method and supporting or challenging observations. Permit editing through a proposed revision. Summarize gaps without treating the diagram as a validated causal model.

The Work view organizes Moves by status and semantic scope, with concurrent Realizations beneath each Move. Show role, local or hosted execution, claims, checkpoints, affected objects, proposed changes and blockers. Start-work produces a task-specific CLI command or skill handoff and scoped credentials. Report only activity actually received from the agent or repository; disconnected agents remain unknown rather than displaying invented progress.

Candidate review compares semantic deltas, source changes, previews and Evaluations against the same target contract. Composition lets users select Thing versions while displaying dependency and rule effects. A promotion panel identifies the exact manifest, current base, required checks, stale or missing evidence, authorization and decision rationale. Revalidate before advancing the head; show deployment and rollout as separate subsequent actions.

Change analysis starts with what was actually edited and the most useful possible consequences. Keep potential effects, metric recomputation and evidence applicability visibly separate; an affected-object count alone is insufficient explanation. Selection opens the exact trigger, dependency witness and evidence details without treating potential impact as a prediction of real-world effects.

The Evaluations view links questions and criteria to Assay/hook versions, selection reasons, execution states, raw observations, interpretations, provenance and limitations. Show required versus advisory checks, unrun or stale evidence, cost estimates/limits, actual usage and funding/settlement state when applicable. Paid or unselected candidates must not appear verified merely because a job was accepted. History records Moves, purpose and Theory revisions, Environment model changes, promotions, phase changes and deployments. An outcome finding or changed assumption can create a prefilled Move referencing the relevant claim and observations.

A shared inspector answers what an object is, why it exists, its dependencies, active changes, governing rules or Theory claims and available evidence. Contextual actions respect capabilities. Deep links pin revision, object and view; local tasks and the UI resolve those same identities. Support keyboard navigation and readable lists alongside diagrams.

The primary creation flow is Template selection → Purpose, Environment, domain Ontology and Theory → model readiness and actionable Move → local task handoff → candidate review → promotion → observation and learning. Conversation proposes structured edits; users can inspect, correct and apply the delta. Reveal source, model probabilities and infrastructure details when they explain a decision. Detailed layout and interaction prototypes remain a design step; these requirements establish the screens, objects and decisions they must support.

## 11 Cloudflare architecture

The Workers control plane, Artifacts storage and World authority support the core protocol. Store the system ontology, Templates and their instantiated Purpose, Environment, domain Ontology and Theory as versioned meta-Things, with identities and relationship indexes in D1. Observations retain their time and context without claiming control of external state. Adopt other services when the corresponding capabilities are needed; every integration is not required in the minimum version.

| **Platform responsibility** | **Cloudflare primitive** |
| --- | --- |
| UI, API and agent protocol | Workers with Static Assets |
| Canonical World head and promotion | Durable Object per World with strongly consistent storage |
| Move claims and candidate coordination | Optional Durable Object per Move |
| Versioned implementations, models, Kits and task workspaces | Artifacts repositories, forks, Workers binding and REST API |
| Repository change triggers | Artifacts Event Subscriptions consumed by a Worker that can start a Workflow |
| Asynchronous check dispatch and retry isolation | Queues |
| Durable verification and approval lifecycle | Workflows |
| World, user and discovery indexes | D1; derived indexes do not own the World head |
| Large evidence, screenshots and logs | R2; manifests retain hashes and references |
| Optional semantic retrieval | Vectorize alongside deterministic graph lookup |
| Optional semantic extraction and reasoning | Workers AI or external LLMs |
| Model-call visibility and supported routing | AI Gateway; unsupported model APIs use an explicit adapter |
| Optional hosted agents and build or test execution | Sandboxes or Containers |
| Optional realistic browser Assays | Browser Run |
| Runtime metrics and observations | Workers Analytics Engine plus application instrumentation |
| Progressive feature rollout | Flagship with native Workers binding or OpenFeature |
| Human and service authentication | Access; application capabilities enforce domain authorization |
| Agent storage and infrastructure authority | Expiring repo tokens and scoped Cloudflare credentials |
| Optional build and deployment linkage | Workers Builds connected to Artifacts; release authorization remains separate |
| Model readiness and declarative inference | Pinned facts and rules in Artifacts; approved rule evaluator in a Worker or external runner; Durable Object records readiness |

Artifacts supports isolation, scoped tokens and events; Durable Objects provide the coordination authority. Workflows provides durable execution, not a general shell runtime. Local or hosted runners execute builds and Assays. Workers AI hosting of a particular System 1 model must be verified separately. [5–11]

## 12 Minimum requirements and unresolved boundaries

The minimum platform must manage the system ontology, World and Thing Templates and their instantiated Purpose, Environment, domain Ontology and Theory; model readiness; desired and realized manifests; Kits and packs; Moves and concurrent Realizations; Task Packets and local CLI interaction; Evaluations and provenance; conflict analysis, candidate composition, permissions, promotion and the World workspace. Preserve intent, hypotheses and evidence. Store extensible phase identity and history; hosted agents and advanced lifecycle automation remain optional.

Before implementation, specify the system ontology and Template schemas, typed fact representation, inference engine and rule interface, readiness obligations, semantic-to-source mapping, CLI adapter, verifier trust model, evidence freshness, deployment adapter and detailed workspace interactions. The next candidate-verification slice is section 3.3: immutable web-app submission, protected existence/build/health/surface Assays, trusted execution and pinned evidence. Selective semantic assessment follows that working path; contributor-funded verification in section 9.1 is optional and does not block it.

The general model supports non-code and external Things. Declare capabilities such as forkable, previewable, reversible, compensatable, destructive, observable and external. Forking a manifest does not copy a database, external account or completed campaign. Transactional source promotion does not guarantee atomic deployment or reversal of migrations and external effects. Adapters must expose these limits; complete external-effect orchestration can follow the minimum protocol.

Completeness is relative to a Template, Kit and scope; semantic detection depends on mappings and models; evidence has coverage and attribution limits; observing outcomes requires appropriate measurement in the Environment. Extend Kits and phases while preserving one representation, evaluation framework, conformity engine and promotion protocol.

## References

Primary documentation verified October 7, 2026. The product requirements above combine the agreed design with proposed implementation contracts; documentation establishes provider capabilities, not the performance of the proposed platform.

1. [Cloudflare competition and Things updates](https://blog.cloudflare.com/next-git-platform-on-cloudflare/)

2. [TypeSafe System One models and decision primitives](https://docs.typesafe.ai/concepts/system-one)

3. [TypeSafe guidance for bounded decisions and deterministic control](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)

4. [TypeSafe confidence and threshold guidance](https://docs.typesafe.ai/confidence)

5. [Cloudflare Artifacts best practices](https://developers.cloudflare.com/artifacts/concepts/best-practices/)

6. [Cloudflare Artifacts REST API](https://developers.cloudflare.com/artifacts/api/rest-api/)

7. [Cloudflare Workflows events and approval waits](https://developers.cloudflare.com/workflows/build/events-and-parameters/)

8. [Cloudflare Artifacts event subscriptions](https://developers.cloudflare.com/artifacts/guides/event-subscriptions/)

9. [Cloudflare Durable Objects storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)

10. [Cloudflare Flagship](https://developers.cloudflare.com/flagship/)

11. [Cloudflare supporting services](https://developers.cloudflare.com/): [Static Assets](https://developers.cloudflare.com/workers/static-assets/), [Queues](https://developers.cloudflare.com/queues/), [D1](https://developers.cloudflare.com/d1/), [R2](https://developers.cloudflare.com/r2/), [Vectorize](https://developers.cloudflare.com/vectorize/), [Workers AI](https://developers.cloudflare.com/workers-ai/), [AI Gateway](https://developers.cloudflare.com/ai-gateway/), [Sandboxes](https://developers.cloudflare.com/sandbox/), [Browser Run](https://developers.cloudflare.com/browser-run/), [Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/), [Access](https://developers.cloudflare.com/cloudflare-one/access-controls/).

12. [Government of Canada guidance on logic models and theory of change](https://www.canada.ca/en/treasury-board-secretariat/services/audit-evaluation/evaluation-government-canada/evaluation-101-backgrounder.html)

13. [Government Analysis Function Theory of Change toolkit](https://analysisfunction.civilservice.gov.uk/policy-store/the-analysis-function-theory-of-change-toolkit/)

14. [Ascent primary repository and documentation](https://github.com/s-arash/ascent)

15. [Cloudflare x402 payment protocol and HTTP headers](https://developers.cloudflare.com/agents/tools/payments/x402/) — inspected 2026-10-08 for this clarification; no payment integration executed.

16. [Cloudflare MPP agent-payment overview](https://developers.cloudflare.com/agents/tools/payments/mpp/) — inspected 2026-10-08 as an alternative header-based payment option.

17. [Cloudflare Monetization Gateway availability and eligibility](https://developers.cloudflare.com/monetization-gateway/) — inspected 2026-10-08; closed beta and United States buyer/seller eligibility are documented constraints.
