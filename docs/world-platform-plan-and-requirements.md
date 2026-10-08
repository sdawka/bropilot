# World Platform Plan and Requirements

We are building a platform for people and agents to define Worlds with a purpose in their Environment, realize changes concurrently, evaluate implementations and outcomes, and decide what becomes canonical. The shared model preserves intent, structure, causal hypotheses, implementations and observations across multiple Artifacts. Git and Cloudflare Artifacts provide versioned storage; our platform provides the collaboration and realization protocol.

## Authority and accepted release decisions

This Markdown document is the canonical, editable plan and requirements. It was converted on 2026-10-08T00:39:47-04:00 from the unchanged [Word source snapshot](../world-platform-plan-and-requirements.docx) (SHA-256 `57aac97fd48a388a3b64ab3baec0977f30b637165bb40da88552fd1e41943e06`). The Word file is a historical source snapshot, not a second editable authority. The imported requirements below are preserved; later changes should update this document and retain decision history in [the decision log](decision_log.md).

- Plan and execute by dependencies and acceptance criteria, without timelines. The competition date in section 1 is retained as source context and does not govern the roadmap.
- The first deployed version serves invited collaborators and their local agents.
- A small real web app anchors initial end-to-end acceptance.
- LFP and UIP provide exploratory evidence; this document governs the first Cloudflare-deployed version.

Provider capabilities and the source document's reported reference-verification date have not been independently reverified during this adoption. Verify the relevant integrations before relying on them in implementation.

## 1 Purpose and system boundary

The central collaboration flow is **World → Move → Realizations → Evaluations → Promotion**, with observations feeding revisions to the World and its Theory.

A World models the system we construct and can span repositories, services and non-code material. Its Environment models the surrounding context; its Purpose defines the intended change in that context. A Move is the unit of collaborative change.

The minimum version supports agents running locally through any compatible CLI harness. Users choose agent providers, roles, number, execution environment and orchestration outside our platform.

Our platform supplies tasks, context, isolated workspaces, permissions, coordination, checks, evidence and decisions. It must support multiple agents working concurrently without requiring platform-hosted agents.

Hosting implementation, review or repair agents on the platform is optional. Engineering concerns enter through reusable Kits and Rule Packs feeding one conformity engine.

The competition requires Workers and Artifacts, concurrent agent work, a 5–10 minute demonstration, permissively licensed source and instructions for trying the project. Submissions close October 14, 2026. [1]

## 2 Core objects

**World.** The system we construct: an application, product, document system, campaign or other intervention. It contains Artifacts, relationships, policies and a stated Purpose relative to one or more Environments. Record its boundary, what it controls, what it can influence and what remains external. A World may begin with only its Purpose and an incomplete model.

**Environment.** A typed component instantiated or referenced through a World or Artifact template. It models users and beneficiary groups, their needs and behaviours, third-party surfaces, organizations, other systems, resources and operating conditions. Its objects have stable identities and links to interfaces and Theory claims. Preserve provenance, assumptions, observations and uncertainty. Shared Environment models may be referenced by multiple Worlds; the model does not control external reality.

**Purpose.** A typed component whose shape and requirements are defined by the template. It states whose need is addressed, the intended change in the Environment, why it matters, constraints and success criteria. Link it to beneficiaries, outcomes and indicators in the Theory. Artifact templates can inherit or refine the World's Purpose. Changes are versioned without redefining historical success.

**Artifact.** An independently versionable part of a World: a frontend, backend module, database schema, document, campaign or external service. Most managed Artifacts use Cloudflare Artifacts repositories; external Artifacts use adapters and explicit references. A domain Artifact is distinct from the Cloudflare storage product.

**Ontology.** A typed definition of allowed entities, properties, relationships, operations and constraints. The platform's system ontology defines World, Artifact, Template, Purpose, Environment, Ontology, Theory and the realization protocol itself. World and Artifact templates specialize that ontology and include a domain ontology, such as routes, APIs, data entities, roles and external interfaces for a webapp. Their instances contain the corresponding content and relationships. The Theory expresses expected causal links among those instances.

**Template.** A versioned, reusable specification of a World or Artifact type within the system ontology. It defines the shapes, relationships, required fields, defaults and constraints for Purpose, Environment, domain Ontology and Theory, alongside rules, acceptance conditions and lifecycle extensions. Creating a World or Artifact instantiates this structure. Artifact templates can inherit shared context by reference and refine it locally; composition validates compatibility with the containing World. These components are part of the template's model, rather than independent attachments.

**Theory.** A typed, versioned component defined by the template, expressing how the World or Artifact should contribute to its Purpose in its Environment. A logic model links inputs, activities, outputs and outcomes; hypotheses describe mechanisms, beneficiaries, assumptions, external influences, risks and unintended effects. Link claims to indicators, evaluation methods and observations. Representing a causal link does not establish its truth. [12]

**World Revision.** An immutable manifest pinning Template versions, Artifact revisions, domain ontology versions, Purpose, Theory, referenced Environment model revisions, Genome, Rule Packs, Assays and configuration. Separate desired revisions from realized compositions and deployed instances. Branching a World branches its manifest; unchanged Artifacts can remain shared by reference. Selecting parallel Artifacts creates a composition requiring validation. Pinning or branching an Environment model does not freeze or duplicate actual users and external systems; observations retain their time and context.

**Move.** The requested change and its reason. It records intent, base World Revision, desired semantic delta, affected ontology nodes and Theory claims, expected contribution to Purpose, dependencies, invariants, acceptance criteria, required evidence, authorized roles and scope, risk, candidate Realizations and final decision. It is the reviewable change object replacing a purely file-oriented pull request.

**Realization.** One concrete attempt to satisfy a Move against a pinned desired revision and base composition. Multiple agents may produce competing Realizations of the same target or complementary Realizations of different Moves. Record its agent identity, workspace repositories, commits, implementation changes, execution status and evidence.

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

Assays produce observations about the Phenome; Evaluations interpret those observations against explicit questions. Every supported claim must identify its evidence. Conformance asks whether the World behaves as specified; outcome evaluation asks whether it produces the intended change for its Environment. Passing implementation checks does not establish an outcome or causal effect. Missing or insufficient observations remain unknown.

## 4 Ontologies Theory and engineering Kits

Rules attach globally or to specific ontology sections. Versioned Rule Packs group concerns such as security, authentication, observability, accessibility, performance and Cloudflare production readiness. Conflicting requirements or incompatible pack versions block actionability until resolved.

A **Kit** packages a World or Artifact Template with compatible Rule Packs, implementation scaffolding, standards, examples, Assays, semantic decision questions, context mappings and execution instructions. The Template defines the model; the Kit supplies reusable means to populate, validate and realize it. Pack rules may require telemetry, access controls, feature flags, deployment records or thresholds; integrations provide those capabilities.

The Theory must connect each intended outcome to beneficiary groups, relevant World activities or capabilities, causal hypotheses and assumptions. Record an indicator, baseline where available, target or expected direction, time horizon, data source and evaluation method. Keep outputs, such as a delivered feature, distinct from outcomes, such as users completing a task more reliably. [12]

Separate enforceable invariants from empirical hypotheses. A causal claim records its rationale, available evidence, alternative explanations and conditions under which it may fail. Evaluations may support, challenge or leave it unresolved; causal attribution requires a suitable study or comparison, not just a metric moving. Learning creates a proposed Theory revision. Requirements concerning measurement or experiment integrity may be hard rules even when the outcome is uncertain. [13]

Actionability requires the Theory detail appropriate to the Kit and Move. It can require a measurement plan before implementation without requiring a future outcome to have already occurred. Promotion uses explicit conformance and risk policy; later outcome evaluation informs maintenance, evolution or a new Move.

The conformity engine must:

Validate schemas, types, required fields, references, relationships and declared deterministic constraints.

Identify contradictions, missing decisions, unresolved dependencies and incomplete acceptance coverage through explicit checks and bounded semantic review.

Trace Purpose to Theory claims, Environment objects, requirements, components or source where known, and to Assays and Evaluations.

Cover realistic user flows, negative cases, cross-Artifact contracts, permissions and relevant regression behaviour.

Report **pass, fail, unknown, stale or waived**, with provenance. Waivers require explicit policy, scope, reason and expiry.

Version Templates and their ontology, Purpose, Theory, Environment models, rules and Assays; propose changes without silently weakening an approved contract.

## 5 Model consistency correctness and minimum completeness

Before realization, validate the instantiated World model against its Template, selected Kits and Move scope. Combine a typed relational model, declarative inference and constraint checks, and bounded semantic judgments. The result is a versioned **Readiness Evaluation** showing what is consistent, what is correctly specified under the declared contract, what essential information is missing and what remains uncertain.

Represent model content as typed objects and relations with stable IDs, sources and revision references. Distinguish declared facts, assumptions, hypotheses, model proposals, observations and derived facts. Templates define required relationships and minimum completion obligations; rules derive dependencies, applicability, coverage and violations across that structure.

**Ascent** is a candidate for the inference layer: a Datalog-like logic language embedded in Rust, with relations, recursive inference, stratified negation, aggregation and support for custom backing data structures. It is more than a data structure. Our persistent model stores the facts; an Ascent-style engine evaluates approved declarative rules over a pinned snapshot. Engine selection and Workers integration remain implementation decisions. [14]

Declarative checks must derive obligations and detect violations, for example:

A Purpose must identify its intended beneficiary and outcome; the beneficiary must resolve to an Environment object of the required type.

An outcome must have the indicator and evaluation plan required by its Template. Missing links are completion gaps; absent future observations do not make an unrealized World invalid.

Every in-scope operation must satisfy its applicable authorization rules, including obligations inherited through interfaces and dependencies.

Every required acceptance criterion must have an Assay or explicitly permitted evaluation method. Referenced objects, contracts and versions must resolve and be compatible.

Conflicting permissions, incompatible constraints, forbidden dependency cycles and unresolved required decisions produce explicit blockers. Cycles are invalid only where the Template forbids them.

**Decision models** handle meaning that explicit rules cannot yet resolve: classifying statements, linking them to candidate ontology types, judging ambiguous contradictions, or identifying an underspecified outcome or criterion. System 1 models return typed choices, scores or yes/no probabilities; they propose interpretations and review signals. Deterministic policy controls whether a proposal becomes an accepted model fact. Reasoning models or people handle uncertain cases and synthesis. [2–4]

The readiness process is:

1. Instantiate the Template and normalize accepted content into typed facts and relations.

2. Validate schemas and references; infer applicable obligations and dependency closure under the declared rules.

3. Assess unresolved semantic questions with relevant context and explicit candidates. Record model answers, uncertainty and required review.

4. Apply approved clarifications, rerun affected rules and emit errors, missing information, warnings and obligations with references to the contributing facts and rules.

5. Mark the exact revision and Move scope actionable only when its required obligations are satisfied and no blocking violation or unresolved mandatory decision remains.

Minimum completeness is defined by the selected Template and scope, not by a generic score or a claim to know everything. Consistency and correctness are relative to explicit rules and accepted facts; the process cannot prove empirical hypotheses or future implementation behaviour. Missing information is unknown unless a completion rule explicitly requires it. Use negation only over declared complete relation scopes when treating absence as a violation.

Pin the Template, fact snapshot, rule versions, accepted interpretations and model versions in the Readiness Evaluation and Task Packet. Retain provenance for derived findings, test rule sets against known valid and invalid models, and validate semantic thresholds on held-out cases. Bound execution and treat incomplete inference as unknown. Recompute after relevant changes; cached judgments depend on exact inputs. The same model supports later context selection, semantic conflict analysis and runtime drift checks, while permissions and promotion remain under deterministic policy.

## 6 Immediate context for every agent

Our structured Artifacts are reusable context. Maintain versioned ontologies, Purpose, Theory, Environment models, specifications, Rule Packs, Assays, architectural decisions, interfaces, dependency maps, source mappings and Evaluations. Cloudflare recommends isolated repositories and forks from trusted baselines, which supports this handoff model. [5]

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

1. **Empty World:** choose or define a World Template, instantiate its Purpose, Environment, domain Ontology and Theory, and add Artifacts through their Templates.

2. **Unrealized World:** extract conversation into a desired revision of the World, Purpose and Theory, linked to Environment objects. Preserve intent, hypotheses, assumptions and open questions.

3. **Actionable Unrealized World:** a Readiness Evaluation confirms consistency, correctness under the declared model contract and minimum completeness for the Template, Kit and Move scope. Required rules, Assays, dependencies and permissions are in place.

4. **Parallel realization:** register task roles, prepare packets and fork implementation Artifacts. Local agents claim work, act independently, checkpoint and push candidates.

5. **Verification:** observe repository changes, run checks and record Evaluations against exact candidate compositions. Reviewer or repair roles may be local or hosted.

6. **Selection and composition:** compare competing Realizations or combine compatible changes across Artifacts. Revalidate the resulting composition and resolve conflicts.

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

Compare candidates against the same relevant acceptance contract. Validate combined Artifacts as a composition; individually passing candidates are insufficient. For example, guest authorization and bulk deletion can conflict through the shared delete capability even when Git merges cleanly. This illustrates semantic checking, without prescribing the competition implementation.

Promotion atomically changes the manifest, not every repository or external system. The World authority must compare the expected base head with the current head, reject stale promotion, and revalidate affected compositions when other work lands. Make claims, event handling, verification and promotion idempotent; tolerate duplicates, retries, delayed events and abandoned agents.

The World authority owns canonical state. Move coordinators may manage claims and candidate status, but cannot bypass World promotion policy. Claims help coordination; capabilities enforce authority. Failed or expired claims do not confer promotion rights.

## 9 Assurance and permissions

Separate specification authoring, Assay authoring, implementation, verification and promotion as roles with independent provenance. They may use different local agents; the platform does not prescribe their count. Multiple agents using the same model do not automatically provide independent assurance.

Define acceptance criteria and protected Assays before implementation where practical. Implementers receive the contract but cannot rewrite the protected oracle or declare their own evidence trusted. Record who produced and verified each result; distinguish self-reported local results from evidence produced by an authorized verifier. Prefer deterministic execution checks over model judgments when behaviour is testable.

An agent capability specifies World, Move, Realization, role, readable Artifacts and Environment data, writable workspace repositories, operations, scope and expiry. Changes to Purpose, Theory, Environment models, Genome or rules, and verification or deployment, require explicit authority. Repo-scoped, short-lived tokens support storage isolation. [5, 6]

Cloudflare repo tokens do not enforce file-level or semantic permissions inside a writable repo. Separate protected material into read-only repositories, validate candidate diffs against scope, and block promotion of unauthorized changes. CLI instructions alone cannot enforce permissions on a user's computer. Production secrets and authority must stay behind independently authorized services.

Approval scales through risk and evidence. A low-risk, independent change with current required evidence may auto-promote under explicit policy. Security-sensitive changes add relevant packs and review; migrations may require human approval; destructive production actions may require two-person approval. These are configurable policies, not blanket approval for every task. Required approval expiry or absence blocks the dependent action. Workflows can durably wait for an approval event. [7]

## 10 World Map and control panel

The UI must help a user decide what to build, understand why it matters, coordinate work, judge candidates and learn from outcomes. Provide a shared World workspace with Overview, Map, Theory, Work, Evaluations and History views. Keep a persistent World and revision selector, Environment context, current phase, global search and a visible distinction between canonical, selected candidate and deployed state.

The Overview shows Purpose, beneficiaries, outcomes, model readiness, deployment and phase state, active Moves, blockers and decisions needing attention. Separate model readiness, implementation conformance and outcome progress. Show timestamps and unknown states; link each status to its rule, claim, Evaluation or next action. An unresolved model obligation is distinct from a failed build or an untested outcome hypothesis.

The Map supports semantic zoom through World, Artifact, subsystem and operation, with the surrounding Environment and a clear system boundary. Offer structure, causal relationships, change activity, risk, observed reality and candidate overlays as distinct views of shared objects. Use a focused diagram with breadcrumbs, filtering, search and a synchronized hierarchy; preserve selection when changing views. Keep relationship direction, type and uncertainty visible.

The Theory view connects Purpose and beneficiary groups to activities, outputs, outcomes and causal hypotheses. Selecting a link reveals its mechanism, assumptions, indicator, evaluation method and supporting or challenging observations. Permit editing through a proposed revision. Summarize gaps without treating the diagram as a validated causal model.

The Work view organizes Moves by status and semantic scope, with concurrent Realizations beneath each Move. Show role, local or hosted execution, claims, checkpoints, affected objects, proposed changes and blockers. Start-work produces a task-specific CLI command or skill handoff and scoped credentials. Report only activity actually received from the agent or repository; disconnected agents remain unknown rather than displaying invented progress.

Candidate review compares semantic deltas, source changes, previews and Evaluations against the same target contract. Composition lets users select Artifact versions while displaying dependency and rule effects. A promotion panel identifies the exact manifest, current base, required checks, stale or missing evidence, authorization and decision rationale. Revalidate before advancing the head; show deployment and rollout as separate subsequent actions.

The Evaluations view links questions and criteria to methods, raw observations, interpretations, provenance and limitations. History records Moves, purpose and Theory revisions, Environment model changes, promotions, phase changes and deployments. An outcome finding or changed assumption can create a prefilled Move referencing the relevant claim and observations.

A shared inspector answers what an object is, why it exists, its dependencies, active changes, governing rules or Theory claims and available evidence. Contextual actions respect capabilities. Deep links pin revision, object and view; local tasks and the UI resolve those same identities. Support keyboard navigation and readable lists alongside diagrams.

The primary creation flow is Template selection → Purpose, Environment, domain Ontology and Theory → model readiness and actionable Move → local task handoff → candidate review → promotion → observation and learning. Conversation proposes structured edits; users can inspect, correct and apply the delta. Reveal source, model probabilities and infrastructure details when they explain a decision. Detailed layout and interaction prototypes remain a design step; these requirements establish the screens, objects and decisions they must support.

## 11 Cloudflare architecture

The Workers control plane, Artifacts storage and World authority support the core protocol. Store the system ontology, Templates and their instantiated Purpose, Environment, domain Ontology and Theory as versioned meta-Artifacts, with identities and relationship indexes in D1. Observations retain their time and context without claiming control of external state. Adopt other services when the corresponding capabilities are needed; every integration is not required in the minimum version.

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

The minimum platform must manage the system ontology, World and Artifact Templates and their instantiated Purpose, Environment, domain Ontology and Theory; model readiness; desired and realized manifests; Kits and packs; Moves and concurrent Realizations; Task Packets and local CLI interaction; Evaluations and provenance; conflict analysis, candidate composition, permissions, promotion and the World workspace. Preserve intent, hypotheses and evidence. Store extensible phase identity and history; hosted agents and advanced lifecycle automation remain optional.

Before implementation, specify the system ontology and Template schemas, typed fact representation, inference engine and rule interface, readiness obligations, semantic-to-source mapping, CLI adapter, verifier trust model, evidence freshness, deployment adapter and detailed workspace interactions.

The general model supports non-code and external Artifacts. Declare capabilities such as forkable, previewable, reversible, compensatable, destructive, observable and external. Forking a manifest does not copy a database, external account or completed campaign. Transactional source promotion does not guarantee atomic deployment or reversal of migrations and external effects. Adapters must expose these limits; complete external-effect orchestration can follow the minimum protocol.

Completeness is relative to a Template, Kit and scope; semantic detection depends on mappings and models; evidence has coverage and attribution limits; observing outcomes requires appropriate measurement in the Environment. Extend Kits and phases while preserving one representation, evaluation framework, conformity engine and promotion protocol.

## References

Primary documentation verified October 7, 2026. The product requirements above combine the agreed design with proposed implementation contracts; documentation establishes provider capabilities, not the performance of the proposed platform.

1. [Cloudflare competition and Artifacts updates](https://blog.cloudflare.com/next-git-platform-on-cloudflare/)

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
