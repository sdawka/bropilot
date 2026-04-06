defmodule Mix.Tasks.Bro.Demo do
  @shortdoc "Generate the Bropilot self-describing demo project"

  @moduledoc """
  Generates a demo project at `demo/` where Bropilot describes itself.

  Every map slot is populated with realistic, hardcoded data about Bropilot —
  serving as both documentation and a showcase of a fully filled-out project.

      $ mix bro.demo
  """

  use Mix.Task

  alias Bropilot.Storage

  @demo_path "demo"

  @impl Mix.Task
  def run(_args) do
    Mix.Task.run("app.start")

    path = Path.expand(@demo_path)

    # Clean previous demo
    if File.dir?(path) do
      File.rm_rf!(path)
    end

    # Initialize project structure
    case Bropilot.init(path) do
      {:ok, bropilot_dir} ->
        map_dir = Path.join(bropilot_dir, "map")

        populate_problem_space(map_dir)
        populate_solution_space(map_dir)
        populate_work_space(map_dir)
        populate_measurement_space(map_dir)
        populate_knowledge_space(map_dir)

        Mix.shell().info([
          IO.ANSI.green(),
          "✓ ",
          IO.ANSI.reset(),
          "Demo project generated at #{path}"
        ])

        Mix.shell().info("  Browse #{path}/.bropilot/map/ to explore Bropilot's self-description.")

      {:error, reason} ->
        Mix.raise("Failed to generate demo: #{inspect(reason)}")
    end
  end

  # ── Problem Space ──────────────────────────────────────────────────────

  defp populate_problem_space(map_dir) do
    Storage.write(map_dir, :problem, :audience, %{
      "audience" =>
        "Developers and technical founders who want to go from vague app idea to working code using structured AI-assisted workflows",
      "segments" => [
        %{
          "name" => "Solo technical founders",
          "description" =>
            "Building MVPs alone, need to move fast but want structured thinking before coding",
          "pain_level" => "high"
        },
        %{
          "name" => "Small dev teams (2-5)",
          "description" =>
            "Need shared understanding of what to build before splitting work across agents and humans",
          "pain_level" => "high"
        },
        %{
          "name" => "AI-curious developers",
          "description" =>
            "Already using Copilot or Cursor but frustrated by lack of direction — good at coding, bad at knowing WHAT to code",
          "pain_level" => "medium"
        }
      ]
    })

    Storage.write(map_dir, :problem, :problem, %{
      "problem" =>
        "Building apps requires translating fuzzy ideas into structured specs before coding. Current tools either skip the thinking (vibe coding) or require too much manual specification. There's no tool that guides you through problem definition, domain modeling, and spec generation, then hands it to coding agents.",
      "symptoms" => [
        "Developers jump straight to code without understanding the problem",
        "AI coding tools produce code that doesn't match the actual need",
        "Specs written manually become stale and disconnected from code",
        "No feedback loop between what was built and what was planned",
        "Context is lost between thinking and coding phases"
      ],
      "impact" =>
        "Wasted cycles, misaligned features, technical debt from day one, and apps that solve the wrong problem"
    })

    Storage.write(map_dir, :problem, :context, %{
      "context" =>
        "Current state of AI coding: tools like GitHub Copilot, Cursor, Claude, and pi coding agents are excellent at writing code but poor at knowing WHAT to code. They operate without structured context about the problem domain, user needs, or system architecture.",
      "landscape" => [
        %{
          "tool" => "GitHub Copilot",
          "strength" => "Inline code completion",
          "weakness" => "No project-level understanding"
        },
        %{
          "tool" => "Cursor",
          "strength" => "Codebase-aware editing",
          "weakness" => "Still requires human to know what to build"
        },
        %{
          "tool" => "Claude / ChatGPT",
          "strength" => "Conversational problem-solving",
          "weakness" => "Context lost between sessions, no structured output"
        },
        %{
          "tool" => "Pi coding agents",
          "strength" => "Autonomous code generation",
          "weakness" => "Need precise specs to be effective, garbage-in-garbage-out"
        }
      ],
      "gap" =>
        "No tool bridges the gap between fuzzy idea and structured spec. Bropilot fills this gap with a guided pipeline that produces machine-readable specs for coding agents."
    })

    Storage.write(map_dir, :problem, :assumptions, %{
      "assumptions" => [
        %{
          "id" => "A1",
          "statement" =>
            "Developers want structured thinking before coding but find it tedious to do manually",
          "confidence" => "high",
          "validation" => "User interviews with 15+ developers confirmed this pattern"
        },
        %{
          "id" => "A2",
          "statement" =>
            "LLMs can reliably extract structured data (YAML) from freeform conversational input",
          "confidence" => "medium",
          "validation" => "Tested with Claude and GPT-4 — works well with clear prompts"
        },
        %{
          "id" => "A3",
          "statement" =>
            "A 5-space model (Problem, Solution, Work, Measurement, Knowledge) covers all aspects of app building",
          "confidence" => "high",
          "validation" => "Mapped against 20+ real projects — no gaps found"
        },
        %{
          "id" => "A4",
          "statement" =>
            "Immutable spaces prevent recipe drift and ensure consistency across projects",
          "confidence" => "high",
          "validation" => "Core architectural constraint validated by dogfooding"
        },
        %{
          "id" => "A5",
          "statement" =>
            "YAML is a sufficient interchange format for specs consumed by coding agents",
          "confidence" => "medium",
          "validation" => "Coding agents parse YAML well; readability matters for humans too"
        },
        %{
          "id" => "A6",
          "statement" =>
            "The feedback loop (Knowledge Space) is essential for maintaining spec-code alignment over time",
          "confidence" => "high",
          "validation" => "Without it, specs drift from reality within weeks"
        }
      ]
    })

    Storage.write(map_dir, :problem, :hypotheses, %{
      "hypotheses" => [
        %{
          "id" => "H1",
          "statement" =>
            "If we guide developers through structured vibe collection, they will produce higher-quality specs than writing specs from scratch",
          "metric" => "Spec completeness score (% of slots filled with actionable data)",
          "target" => "80%+ slot fill rate after Act 1 + Act 2"
        },
        %{
          "id" => "H2",
          "statement" =>
            "If coding agents receive Bropilot-generated specs, they will produce code that matches requirements on the first pass more often",
          "metric" => "First-pass acceptance rate of generated code",
          "target" => "60%+ tasks accepted without revision"
        },
        %{
          "id" => "H3",
          "statement" =>
            "If the Knowledge Space auto-updates after each task, spec drift will be eliminated",
          "metric" => "Percentage of specs that remain accurate after 10 build cycles",
          "target" => "95%+ spec accuracy after 10 versions"
        },
        %{
          "id" => "H4",
          "statement" =>
            "A three-act pipeline (Vibe Collection -> Domain Modeling -> Build) matches how developers naturally think about projects",
          "metric" => "Pipeline completion rate and user satisfaction",
          "target" => "70%+ of users complete all 3 acts"
        }
      ]
    })

    Storage.write(map_dir, :problem, :"vibes/basics", %{
      "audience" =>
        "Developers and technical founders who want to go from vague app idea to working code",
      "use_cases" => [
        "Solo founder starts with an idea, ends with a spec-driven codebase",
        "Team uses Bropilot to align on what to build before splitting work",
        "Developer feeds Bropilot specs into pi coding agents for autonomous builds",
        "Product manager uses filled map to understand technical architecture",
        "Developer revisits a project after months and uses the map as documentation"
      ],
      "capabilities" => [
        "Guided vibe collection through conversational prompts",
        "LLM-powered extraction of structured data from freeform input",
        "Domain model generation (entities, relationships, flows)",
        "Spec expansion (API, behaviours, constraints, modules, events)",
        "Version snapshots with diff-based change tracking",
        "Task generation with context and definition of done",
        "Codegen dispatch to pi coding agents",
        "Self-updating Knowledge Space (glossary, decisions, changelog, cross-references)"
      ],
      "design" =>
        "CLI-first with optional web UI. Minimal, developer-friendly. YAML-based data layer for transparency and version control. Pipeline metaphor with acts and steps.",
      "volo" =>
        "An app that makes apps — by thinking before coding. The developer's structured thinking partner that bridges the gap between idea and implementation.",
      "hypotheses" => [
        "Guided structure beats freeform for spec quality",
        "Coding agents work dramatically better with structured specs",
        "Self-referential feedback loops keep specs alive"
      ],
      "assumptions" => [
        "Developers want structure but not bureaucracy",
        "LLMs can extract structured data from conversation",
        "Five spaces cover all aspects of app building",
        "YAML is the right interchange format"
      ]
    })
  end

  # ── Solution Space ─────────────────────────────────────────────────────

  defp populate_solution_space(map_dir) do
    write_vocabulary(map_dir)
    write_domain(map_dir)
    write_flows(map_dir)
    write_architecture(map_dir)
    write_specs(map_dir)
  end

  defp write_vocabulary(map_dir) do
    Storage.write(map_dir, :solution, :vocabulary, %{
      "terms" => [
        %{
          "term" => "Space",
          "definition" =>
            "One of 5 immutable thinking categories: Problem, Solution, Work, Measurement, Knowledge. Defined in Bropilot core, never modified by recipes.",
          "module" => "Bropilot.Spaces"
        },
        %{
          "term" => "Recipe",
          "definition" =>
            "A superuser-level configuration that defines the pipeline steps, prompts, schemas, and validations. Lives in .bropilot/recipe/.",
          "module" => "Bropilot.Recipe.Registry"
        },
        %{
          "term" => "Map",
          "definition" =>
            "The user-level data layer. YAML files in .bropilot/map/ organized by space. Filled in by going through the pipeline.",
          "module" => "Bropilot.Map.Store"
        },
        %{
          "term" => "Pipeline",
          "definition" =>
            "The ordered sequence of acts and steps that transform vibes into specs into code. Defined in recipe/pipeline.yaml.",
          "module" => "Bropilot.Pipeline.Engine"
        },
        %{
          "term" => "Act",
          "definition" =>
            "A major phase of the pipeline. Act 1: Vibe Collection, Act 2: Domain Modeling, Act 3: Build.",
          "module" => "Bropilot.Pipeline.Engine"
        },
        %{
          "term" => "Step",
          "definition" =>
            "A single unit of work within an act. Each step maps to a primary space and may contribute to cross-cutting spaces.",
          "module" => "Bropilot.Pipeline.Engine"
        },
        %{
          "term" => "Vibe",
          "definition" =>
            "Freeform, conversational input from the user about their app idea. Collected in Act 1 and extracted into structured data.",
          "module" => "Bropilot.Pipeline.Act1.Worker"
        },
        %{
          "term" => "Domain Model",
          "definition" =>
            "Entities, relationships, and flows that describe the app's problem and solution domains. Generated in Act 2 Step 3.",
          "module" => "Bropilot.Pipeline.Act2.Worker"
        },
        %{
          "term" => "Spec",
          "definition" =>
            "A detailed specification file in map/solution/specs/. Covers API, behaviours, constraints, entities, modules, events, externals, views, components, streams, and infra.",
          "module" => "Bropilot.Pipeline.Act2.Worker"
        },
        %{
          "term" => "Snapshot",
          "definition" =>
            "A frozen copy of the problem and solution spaces at a point in time. Creates a version in map/work/versions/.",
          "module" => "Bropilot.Pipeline.Act3.Snapshot"
        },
        %{
          "term" => "Diff",
          "definition" =>
            "A path-based comparison between two snapshots that identifies added, modified, and removed specs.",
          "module" => "Bropilot.Pipeline.Act3.Diff"
        },
        %{
          "term" => "Task",
          "definition" =>
            "A work item generated from a diff change. Contains title, description, context, definition of done, priority, and related specs.",
          "module" => "Bropilot.Pipeline.Act3.TaskGenerator"
        },
        %{
          "term" => "Artifact",
          "definition" =>
            "A concrete output produced by a task: source files, tests, database interfaces, debug logs.",
          "module" => "Bropilot.Task.Agent"
        },
        %{
          "term" => "Gate",
          "definition" =>
            "A validation checkpoint between spaces. All required slots must be filled before advancing to the next space.",
          "module" => "Bropilot.Spaces"
        },
        %{
          "term" => "Slot",
          "definition" =>
            "A named data location within a space. Can be a file (.yaml) or a directory containing multiple files. Defined in spaces.lock.",
          "module" => "Bropilot.Spaces.Space"
        },
        %{
          "term" => "Extraction",
          "definition" =>
            "The process of converting freeform LLM output into structured YAML data that populates map slots.",
          "module" => "Bropilot.Pipeline.Act1.Extractor"
        },
        %{
          "term" => "Pi",
          "definition" =>
            "A coding agent process managed by the Pi Pool. Receives task prompts and produces code artifacts.",
          "module" => "Bropilot.Pi.Pool"
        },
        %{
          "term" => "Feedback Loop",
          "definition" =>
            "The mechanism by which completed tasks update the Knowledge Space (changelog, xrefs, glossary), keeping specs aligned with reality.",
          "module" => "Bropilot.Pipeline.Feedback"
        },
        %{
          "term" => "VOLO",
          "definition" =>
            "Vision of Lovable Output. A one-sentence description of what the finished product feels like to its user.",
          "module" => "Bropilot.Pipeline.Act1.Worker"
        },
        %{
          "term" => "Three-Tier Model",
          "definition" =>
            "The authority hierarchy: Spaces (immutable core) > Recipe (superuser config) > Map (user data). Ensures structural consistency.",
          "module" => "Bropilot"
        }
      ]
    })
  end

  defp write_domain(map_dir) do
    Storage.write(map_dir, :solution, :"domain/entities", %{
      "entities" => [
        %{
          "name" => "Project",
          "description" =>
            "A Bropilot project rooted at a directory with .bropilot/ inside. Has a recipe and a map.",
          "attributes" => ["path", "name", "purpose", "recipe_name"]
        },
        %{
          "name" => "Recipe",
          "description" =>
            "Defines the pipeline configuration: acts, steps, prompts, schemas, validations.",
          "attributes" => ["name", "version", "description", "acts", "steps", "dir"]
        },
        %{
          "name" => "Pipeline",
          "description" =>
            "The execution engine that tracks progress through recipe steps and enforces gates.",
          "attributes" => [
            "current_step_index",
            "completed_steps",
            "recipe"
          ]
        },
        %{
          "name" => "Step",
          "description" =>
            "A unit of pipeline work. Maps to a primary space, has a prompt, and produces map data.",
          "attributes" => [
            "id",
            "name",
            "space",
            "space_slots",
            "knowledge_contributes",
            "measurement_contributes",
            "prompt"
          ]
        },
        %{
          "name" => "Space",
          "description" =>
            "An immutable thinking category with required slots and gate validation.",
          "attributes" => [
            "id",
            "name",
            "description",
            "governs",
            "required_slots",
            "cross_cutting?"
          ]
        },
        %{
          "name" => "Slot",
          "description" =>
            "A named data location within a space. File slots hold a single YAML file, directory slots hold multiple.",
          "attributes" => ["id", "name", "type", "required"]
        },
        %{
          "name" => "Version",
          "description" =>
            "A snapshot of problem + solution spaces with associated changes and tasks.",
          "attributes" => [
            "number",
            "snapshot",
            "changes",
            "tasks"
          ]
        },
        %{
          "name" => "Task",
          "description" =>
            "A work item generated from a spec change. Dispatched to coding agents.",
          "attributes" => [
            "id",
            "title",
            "description",
            "context",
            "definition_of_done",
            "dependencies",
            "priority",
            "related_specs",
            "status"
          ]
        },
        %{
          "name" => "Artifact",
          "description" =>
            "Output produced by a completed task: code files, tests, DB interfaces.",
          "attributes" => ["path", "type", "task_id", "version"]
        }
      ]
    })

    Storage.write(map_dir, :solution, :"domain/relationships", %{
      "relationships" => [
        %{
          "from" => "Project",
          "to" => "Recipe",
          "type" => "has_one",
          "description" => "A project has exactly one active recipe"
        },
        %{
          "from" => "Project",
          "to" => "Map",
          "type" => "has_one",
          "description" => "A project has one map directory with all space data"
        },
        %{
          "from" => "Recipe",
          "to" => "Step",
          "type" => "has_many",
          "description" => "A recipe defines an ordered list of pipeline steps"
        },
        %{
          "from" => "Step",
          "to" => "Space",
          "type" => "belongs_to",
          "description" => "Each step maps to exactly one primary space"
        },
        %{
          "from" => "Space",
          "to" => "Slot",
          "type" => "has_many",
          "description" => "Each space has required slots that must be filled"
        },
        %{
          "from" => "Version",
          "to" => "Task",
          "type" => "has_many",
          "description" => "A version generates multiple tasks from its change plan"
        },
        %{
          "from" => "Task",
          "to" => "Artifact",
          "type" => "produces",
          "description" => "A completed task produces one or more artifacts"
        },
        %{
          "from" => "Task",
          "to" => "Knowledge",
          "type" => "feeds_back",
          "description" =>
            "Completed tasks update changelog, xrefs, and glossary in the Knowledge Space"
        },
        %{
          "from" => "Pipeline",
          "to" => "Space",
          "type" => "validates_gate",
          "description" =>
            "Pipeline checks gate validation when crossing space boundaries"
        }
      ]
    })
  end

  defp write_flows(map_dir) do
    Storage.write(map_dir, :solution, :"flows/user-flows", %{
      "flows" => [
        %{
          "name" => "Initialize Project",
          "trigger" => "mix bro.init [path]",
          "steps" => [
            "Create .bropilot/ directory",
            "Write spaces.lock (immutable space definitions)",
            "Copy default recipe (webapp) to .bropilot/recipe/",
            "Scaffold empty map directories for all spaces"
          ],
          "outcome" => "Ready-to-use .bropilot/ project structure"
        },
        %{
          "name" => "Vibe Collection (Act 1)",
          "trigger" => "mix bro.vibe",
          "steps" => [
            "Step 1: User answers 'Tell me about your app' freeform prompt",
            "LLM extracts name, purpose, problem, context, glossary terms",
            "Step 2: User answers 6 targeted questions about audience, use cases, design",
            "LLM extracts audience, assumptions, hypotheses, vibes/basics"
          ],
          "outcome" => "Problem Space fully populated"
        },
        %{
          "name" => "Domain Modeling (Act 2, Step 3)",
          "trigger" => "mix bro.plan (step 3)",
          "steps" => [
            "Read all Problem Space data from the map",
            "Build prompt with guiding questions from pipeline.yaml",
            "LLM generates vocabulary, entities, relationships, flows",
            "Write to map/solution/ (vocabulary, domain/, flows/, architecture/)"
          ],
          "outcome" => "Domain model established in Solution Space"
        },
        %{
          "name" => "Spec Expansion (Act 2, Step 4)",
          "trigger" => "mix bro.plan (step 4)",
          "steps" => [
            "Read domain model from Solution Space",
            "LLM expands into 11 spec files",
            "Write specs to map/solution/specs/"
          ],
          "outcome" => "Full specifications ready for implementation"
        },
        %{
          "name" => "Build Cycle (Act 3)",
          "trigger" => "mix bro.build",
          "steps" => [
            "Step 5: Create version snapshot of problem + solution",
            "Step 6: Diff snapshot against previous version, generate changes",
            "Step 7: Generate tasks from changes with context and DoDs",
            "Step 8: Dispatch tasks to pi coding agents, collect artifacts",
            "Feedback: Update Knowledge Space (changelog, xrefs, glossary)"
          ],
          "outcome" => "Code generated, knowledge updated, version complete"
        }
      ]
    })

    Storage.write(map_dir, :solution, :"flows/system-flows", %{
      "flows" => [
        %{
          "name" => "LLM Extraction",
          "trigger" => "Act1.Worker.extract/1 or Act2.Worker.extract/1",
          "steps" => [
            "Build extraction prompt with system instructions for YAML output",
            "Send to configured LLM provider (Anthropic, OpenAI, or mock)",
            "Strip code fences from response",
            "Parse YAML into Elixir map",
            "Write structured data to appropriate map slots"
          ],
          "modules" => [
            "Bropilot.LLM",
            "Bropilot.Pipeline.Act1.Extractor",
            "Bropilot.Pipeline.Act2.Extractor"
          ]
        },
        %{
          "name" => "Snapshot and Diff",
          "trigger" => "Act3.Executor.run/2",
          "steps" => [
            "Read all YAML files from map/problem/ and map/solution/ recursively",
            "Bundle into snapshot map, determine next version number",
            "Write snapshot.yaml to map/work/versions/v{NNN}/",
            "Deep-diff new snapshot against previous (or empty for v001)",
            "Produce path-based change list (added, modified, removed)"
          ],
          "modules" => [
            "Bropilot.Pipeline.Act3.Snapshot",
            "Bropilot.Pipeline.Act3.Diff"
          ]
        },
        %{
          "name" => "Task Dispatch",
          "trigger" => "Act3.TaskGenerator.generate_tasks/1",
          "steps" => [
            "Generate one task per change with context and DoD",
            "Write task YAML files to versions/v{NNN}/tasks/",
            "For each task, build codegen prompt from step8 template",
            "Dispatch to Pi Pool (DynamicSupervisor spawns Pi.Port)",
            "Collect results and update task status"
          ],
          "modules" => [
            "Bropilot.Pipeline.Act3.TaskGenerator",
            "Bropilot.Task.Agent",
            "Bropilot.Task.Supervisor",
            "Bropilot.Pi.Pool"
          ]
        },
        %{
          "name" => "Feedback Loop",
          "trigger" => "Pipeline.Feedback.update_knowledge/3",
          "steps" => [
            "Build changelog entry from task and result",
            "Append to knowledge/changelog.yaml",
            "Build cross-references from task specs and artifact paths",
            "Append to knowledge/xrefs.yaml (deduplicated)",
            "Extract new terms from task title and specs",
            "Merge into knowledge/glossary.yaml"
          ],
          "modules" => ["Bropilot.Pipeline.Feedback"]
        }
      ]
    })
  end

  defp write_architecture(map_dir) do
    Storage.write(map_dir, :solution, :"architecture/components", %{
      "components" => [
        %{
          "name" => "Elixir Core",
          "description" =>
            "The heart of Bropilot. OTP application with GenServers for pipeline engine, act workers, task agents, and Pi pool management.",
          "modules" => [
            "Bropilot",
            "Bropilot.Application",
            "Bropilot.Spaces",
            "Bropilot.Map.Store",
            "Bropilot.Yaml"
          ],
          "runtime" => "BEAM VM"
        },
        %{
          "name" => "Pipeline Engine",
          "description" =>
            "GenServer that holds pipeline position, tracks step completion, and enforces space-gate validation.",
          "modules" => [
            "Bropilot.Pipeline.Engine",
            "Bropilot.Pipeline.Supervisor"
          ],
          "runtime" => "BEAM VM"
        },
        %{
          "name" => "Act Workers",
          "description" =>
            "GenServers for each act: Act1.Worker (vibe collection), Act2.Worker (domain modeling), Act3.Executor (build).",
          "modules" => [
            "Bropilot.Pipeline.Act1.Worker",
            "Bropilot.Pipeline.Act1.Extractor",
            "Bropilot.Pipeline.Act2.Worker",
            "Bropilot.Pipeline.Act2.Extractor",
            "Bropilot.Pipeline.Act3.Executor",
            "Bropilot.Pipeline.Act3.Snapshot",
            "Bropilot.Pipeline.Act3.Diff",
            "Bropilot.Pipeline.Act3.TaskGenerator"
          ],
          "runtime" => "BEAM VM"
        },
        %{
          "name" => "LLM Client",
          "description" =>
            "Facade for LLM interactions. Routes to Anthropic, OpenAI, or mock provider. Handles YAML extraction with code fence stripping.",
          "modules" => [
            "Bropilot.LLM",
            "Bropilot.LLM.Client",
            "Bropilot.LLM.Anthropic",
            "Bropilot.LLM.OpenAI",
            "Bropilot.LLM.Mock"
          ],
          "runtime" => "BEAM VM + HTTP (Req)"
        },
        %{
          "name" => "Pi Pool",
          "description" =>
            "DynamicSupervisor managing a pool of pi coding-agent processes. Checkout/checkin lifecycle for task execution.",
          "modules" => [
            "Bropilot.Pi.Pool",
            "Bropilot.Pi.Port",
            "Bropilot.Pi.Protocol"
          ],
          "runtime" => "BEAM VM"
        },
        %{
          "name" => "CLI / Mix Tasks",
          "description" =>
            "Developer-facing CLI via Mix tasks: init, vibe, plan, build, status, snapshot, tasks, recipe, web, demo.",
          "modules" => [
            "Mix.Tasks.Bro.Init",
            "Mix.Tasks.Bro.Vibe",
            "Mix.Tasks.Bro.Plan",
            "Mix.Tasks.Bro.Build",
            "Mix.Tasks.Bro.Status",
            "Mix.Tasks.Bro.Snapshot",
            "Mix.Tasks.Bro.Tasks",
            "Mix.Tasks.Bro.Recipe",
            "Mix.Tasks.Bro.Web",
            "Mix.Tasks.Bro.Demo"
          ],
          "runtime" => "Mix"
        },
        %{
          "name" => "Recipe System",
          "description" =>
            "Loads, validates, and caches recipe definitions. Includes schema validation for map data.",
          "modules" => [
            "Bropilot.Recipe.Registry",
            "Bropilot.Recipe.Schema",
            "Bropilot.Recipe.Installer",
            "Bropilot.Recipe.Publisher"
          ],
          "runtime" => "BEAM VM"
        }
      ]
    })

    Storage.write(map_dir, :solution, :"architecture/dependencies", %{
      "dependencies" => [
        %{
          "from" => "CLI / Mix Tasks",
          "to" => "Elixir Core",
          "type" => "calls",
          "description" => "Mix tasks call Bropilot.init/2, Spaces, Map.Store"
        },
        %{
          "from" => "CLI / Mix Tasks",
          "to" => "Pipeline Engine",
          "type" => "starts",
          "description" => "Mix tasks start and advance the pipeline engine"
        },
        %{
          "from" => "Pipeline Engine",
          "to" => "Act Workers",
          "type" => "orchestrates",
          "description" => "Engine delegates to act-specific workers"
        },
        %{
          "from" => "Act Workers",
          "to" => "LLM Client",
          "type" => "calls",
          "description" => "Workers use LLM.extract_yaml/2 for structured extraction"
        },
        %{
          "from" => "Act Workers",
          "to" => "Elixir Core",
          "type" => "writes",
          "description" => "Workers write extracted data via Map.Store"
        },
        %{
          "from" => "Act Workers",
          "to" => "Pi Pool",
          "type" => "dispatches",
          "description" => "Act 3 dispatches codegen tasks to Pi agents"
        },
        %{
          "from" => "Pi Pool",
          "to" => "LLM Client",
          "type" => "calls",
          "description" => "Pi agents use LLM for code generation"
        },
        %{
          "from" => "Pipeline Engine",
          "to" => "Recipe System",
          "type" => "loads",
          "description" => "Engine loads recipe on init via Registry"
        },
        %{
          "from" => "Recipe System",
          "to" => "Elixir Core",
          "type" => "validates_against",
          "description" => "Recipe validation checks against immutable Spaces"
        }
      ]
    })
  end

  defp write_specs(map_dir) do
    write_spec_api(map_dir)
    write_spec_behaviours(map_dir)
    write_spec_constraints(map_dir)
    write_spec_entities(map_dir)
    write_spec_modules(map_dir)
    write_spec_events(map_dir)
    write_spec_externals(map_dir)
    write_spec_views(map_dir)
    write_spec_components(map_dir)
    write_spec_streams(map_dir)
    write_spec_infra(map_dir)
  end

  defp write_spec_api(map_dir) do
    Storage.write(map_dir, :solution, :"specs/api", %{
      "api" => [
        %{
          "method" => "POST",
          "path" => "/api/projects",
          "description" => "Initialize a new Bropilot project",
          "request" => %{"path" => "string", "recipe" => "string (optional, default: webapp)"},
          "response" => %{"project_path" => "string", "bropilot_dir" => "string"},
          "module" => "Bropilot"
        },
        %{
          "method" => "GET",
          "path" => "/api/projects/:path/status",
          "description" => "Get pipeline status for a project",
          "response" => %{
            "current_step" => "map",
            "completed_steps" => "list",
            "spaces" => "map"
          },
          "module" => "Bropilot.Pipeline.Engine"
        },
        %{
          "method" => "GET",
          "path" => "/api/projects/:path/map/:space",
          "description" => "Read all slots for a space",
          "response" => %{"slots" => "map of slot_name -> data"},
          "module" => "Bropilot.Map.Store"
        },
        %{
          "method" => "GET",
          "path" => "/api/projects/:path/map/:space/:slot",
          "description" => "Read a specific map slot",
          "response" => %{"data" => "map"},
          "module" => "Bropilot.Map.Store"
        },
        %{
          "method" => "POST",
          "path" => "/api/projects/:path/pipeline/step1",
          "description" => "Start Act 1 Step 1 (basics prompt)",
          "response" => %{"prompt" => "string"},
          "module" => "Bropilot.Pipeline.Act1.Worker"
        },
        %{
          "method" => "POST",
          "path" => "/api/projects/:path/pipeline/step1/input",
          "description" => "Submit freeform user input for Step 1",
          "request" => %{"text" => "string"},
          "response" => %{"status" => "ok"},
          "module" => "Bropilot.Pipeline.Act1.Worker"
        },
        %{
          "method" => "POST",
          "path" => "/api/projects/:path/pipeline/step1/extract",
          "description" => "Run LLM extraction for Step 1",
          "response" => %{"data" => "map (extracted structured data)"},
          "module" => "Bropilot.Pipeline.Act1.Worker"
        },
        %{
          "method" => "POST",
          "path" => "/api/projects/:path/pipeline/step3",
          "description" => "Start Act 2 Step 3 (domain model)",
          "response" => %{"prompt" => "string"},
          "module" => "Bropilot.Pipeline.Act2.Worker"
        },
        %{
          "method" => "POST",
          "path" => "/api/projects/:path/pipeline/advance",
          "description" => "Advance pipeline to next step (with gate validation)",
          "response" => %{"next_step" => "map"},
          "module" => "Bropilot.Pipeline.Engine"
        },
        %{
          "method" => "POST",
          "path" => "/api/projects/:path/build",
          "description" => "Run full Act 3 build cycle (snapshot, diff, tasks, codegen)",
          "response" => %{
            "version" => "integer",
            "tasks_count" => "integer",
            "summary" => "map"
          },
          "module" => "Bropilot.Pipeline.Act3.Executor"
        },
        %{
          "method" => "GET",
          "path" => "/api/projects/:path/versions",
          "description" => "List all versions for a project",
          "response" => %{"versions" => "list of version numbers"},
          "module" => "Bropilot.Pipeline.Act3.Snapshot"
        },
        %{
          "method" => "GET",
          "path" => "/api/projects/:path/versions/:version/tasks",
          "description" => "List tasks for a specific version",
          "response" => %{"tasks" => "list of task maps"},
          "module" => "Bropilot.Pipeline.Act3.TaskGenerator"
        }
      ]
    })
  end

  defp write_spec_behaviours(map_dir) do
    Storage.write(map_dir, :solution, :"specs/behaviours", %{
      "behaviours" => [
        %{
          "name" => "Gate Validation",
          "description" =>
            "When the pipeline crosses a space boundary, all required slots of the current space must be filled.",
          "trigger" => "Pipeline.Engine.advance/1 detects space change",
          "module" => "Bropilot.Spaces.validate_gate/2",
          "rules" => [
            "File slots: .yaml or .yml must exist",
            "Directory slots: directory must exist",
            "Only required slots are checked",
            "Cross-cutting spaces (Measurement, Knowledge) are not gated"
          ]
        },
        %{
          "name" => "Recipe Validation",
          "description" =>
            "Every recipe must map at least one step to each primary space (Problem, Solution, Work).",
          "trigger" => "Recipe.Registry.load/1",
          "module" => "Bropilot.Spaces.validate_recipe/1",
          "rules" => [
            "Extract unique spaces from all steps",
            "Check that Problem, Solution, Work are all covered",
            "Measurement and Knowledge are cross-cutting, not required"
          ]
        },
        %{
          "name" => "LLM Extraction",
          "description" =>
            "Convert freeform LLM output into structured YAML and write to map slots.",
          "trigger" => "Act1.Worker.extract/1 or Act2.Worker.extract/1",
          "module" => "Bropilot.LLM.extract_yaml/2",
          "rules" => [
            "System prompt instructs YAML-only output",
            "Strip markdown code fences from response",
            "Parse with yaml_elixir",
            "Return {:ok, map} or {:error, reason}"
          ]
        },
        %{
          "name" => "Schema Validation",
          "description" =>
            "Validate map data against recipe-defined schemas (.schema.yaml files).",
          "trigger" => "Recipe.Schema.validate_map_slot/4",
          "module" => "Bropilot.Recipe.Schema",
          "rules" => [
            "Check required fields are present",
            "Validate types: string, text, boolean, enum, list, map, ref, any",
            "Validate enum values against allowed list",
            "Validate list item types and nested map fields"
          ]
        },
        %{
          "name" => "Snapshot Creation",
          "description" =>
            "Bundle all problem and solution YAML into a versioned snapshot.",
          "trigger" => "Act3.Executor.run/2 or mix bro.snapshot",
          "module" => "Bropilot.Pipeline.Act3.Snapshot",
          "rules" => [
            "Read all YAML files recursively from map/problem/ and map/solution/",
            "Auto-increment version number (v001, v002, ...)",
            "Write snapshot.yaml to map/work/versions/v{NNN}/"
          ]
        }
      ]
    })
  end

  defp write_spec_constraints(map_dir) do
    Storage.write(map_dir, :solution, :"specs/constraints", %{
      "constraints" => [
        %{
          "id" => "C1",
          "name" => "Immutable Spaces",
          "description" =>
            "The 5 spaces (Problem, Solution, Work, Measurement, Knowledge) are defined in Bropilot core and cannot be added, removed, or renamed by recipes.",
          "enforced_by" => "Bropilot.Spaces module (compile-time constant @space_ids)",
          "severity" => "critical"
        },
        %{
          "id" => "C2",
          "name" => "Recipe Must Cover All Primary Spaces",
          "description" =>
            "Every recipe must have at least one step mapped to each primary space: Problem, Solution, Work.",
          "enforced_by" => "Bropilot.Spaces.validate_recipe/1",
          "severity" => "critical"
        },
        %{
          "id" => "C3",
          "name" => "Gate Validation Before Space Transition",
          "description" =>
            "Pipeline cannot advance to a step in a new space until all required slots of the current space are filled.",
          "enforced_by" => "Bropilot.Pipeline.Engine.handle_call(:advance, ...)",
          "severity" => "high"
        },
        %{
          "id" => "C4",
          "name" => "YAML-Only Data Layer",
          "description" =>
            "All map data is stored as YAML files. No database. Files are human-readable and version-controllable.",
          "enforced_by" => "Bropilot.Map.Store and Bropilot.Yaml",
          "severity" => "high"
        },
        %{
          "id" => "C5",
          "name" => "spaces.lock Is Auto-Generated",
          "description" =>
            "The spaces.lock file is generated by Bropilot core on init and must never be manually edited.",
          "enforced_by" => "Bropilot.init/2 calls Spaces.generate_lock/0",
          "severity" => "high"
        },
        %{
          "id" => "C6",
          "name" => "Version Numbers Are Sequential",
          "description" =>
            "Versions are auto-incremented (v001, v002, ...). No gaps, no manual numbering.",
          "enforced_by" => "Bropilot.Pipeline.Act3.Snapshot.create_snapshot/1",
          "severity" => "medium"
        },
        %{
          "id" => "C7",
          "name" => "Knowledge Space Is Append-Only",
          "description" =>
            "Changelog entries, xrefs, and glossary terms are only appended, never removed. Glossary terms may be updated with latest definitions.",
          "enforced_by" => "Bropilot.Pipeline.Feedback",
          "severity" => "medium"
        }
      ]
    })
  end

  defp write_spec_entities(map_dir) do
    Storage.write(map_dir, :solution, :"specs/entities", %{
      "entities" => [
        %{
          "name" => "Project",
          "storage" => "File system (.bropilot/ directory)",
          "fields" => [
            %{"name" => "path", "type" => "string", "description" => "Absolute path to project root"},
            %{
              "name" => "name",
              "type" => "string",
              "description" => "Project name from map/project.yaml"
            },
            %{
              "name" => "purpose",
              "type" => "string",
              "description" => "One-line purpose statement"
            }
          ]
        },
        %{
          "name" => "Recipe",
          "storage" => ".bropilot/recipe/ directory",
          "fields" => [
            %{"name" => "name", "type" => "string", "description" => "Recipe identifier"},
            %{"name" => "version", "type" => "string", "description" => "Semver version"},
            %{
              "name" => "description",
              "type" => "text",
              "description" => "What this recipe does"
            },
            %{"name" => "acts", "type" => "list", "description" => "Pipeline act definitions"},
            %{
              "name" => "steps",
              "type" => "list",
              "description" => "Flattened step list with space mappings"
            }
          ]
        },
        %{
          "name" => "Version",
          "storage" => ".bropilot/map/work/versions/v{NNN}/",
          "fields" => [
            %{
              "name" => "number",
              "type" => "integer",
              "description" => "Sequential version number"
            },
            %{
              "name" => "snapshot",
              "type" => "map",
              "description" => "Frozen problem + solution data"
            },
            %{
              "name" => "changes",
              "type" => "list",
              "description" => "Diff from previous version"
            },
            %{"name" => "tasks", "type" => "list", "description" => "Generated work tasks"}
          ]
        },
        %{
          "name" => "Task",
          "storage" => "versions/v{NNN}/tasks/task-{NNN}.yaml",
          "fields" => [
            %{"name" => "id", "type" => "integer", "description" => "Sequential task ID"},
            %{"name" => "title", "type" => "string", "description" => "Human-readable title"},
            %{
              "name" => "description",
              "type" => "text",
              "description" => "What needs to be done"
            },
            %{
              "name" => "context",
              "type" => "map",
              "description" => "Relevant spec data from the change"
            },
            %{
              "name" => "definition_of_done",
              "type" => "list",
              "description" => "Acceptance criteria"
            },
            %{
              "name" => "priority",
              "type" => "enum",
              "values" => ["high", "medium", "low"]
            },
            %{
              "name" => "status",
              "type" => "enum",
              "values" => ["pending", "in_progress", "completed", "failed"]
            }
          ]
        }
      ]
    })
  end

  defp write_spec_modules(map_dir) do
    Storage.write(map_dir, :solution, :"specs/modules", %{
      "modules" => [
        %{
          "name" => "Bropilot",
          "path" => "lib/bropilot.ex",
          "responsibility" => "Top-level API: init/2, three-tier model documentation",
          "public_functions" => ["init/2"]
        },
        %{
          "name" => "Bropilot.Application",
          "path" => "lib/bropilot/application.ex",
          "responsibility" => "OTP application supervisor tree startup",
          "public_functions" => ["start/2"]
        },
        %{
          "name" => "Bropilot.Spaces",
          "path" => "lib/bropilot/spaces/spaces.ex",
          "responsibility" =>
            "Immutable space definitions, gate validation, recipe validation, lock generation",
          "public_functions" => [
            "all/0",
            "ids/0",
            "primary_ids/0",
            "definition/1",
            "validate_recipe/1",
            "validate_gate/2",
            "generate_lock/0"
          ]
        },
        %{
          "name" => "Bropilot.Map.Store",
          "path" => "lib/bropilot/map/store.ex",
          "responsibility" => "Read/write YAML files in the map/ directory",
          "public_functions" => ["read/3", "write/4", "exists?/3", "slot_path/3"]
        },
        %{
          "name" => "Bropilot.Yaml",
          "path" => "lib/bropilot/yaml.ex",
          "responsibility" =>
            "YAML encoding/decoding: custom encoder for writing, yaml_elixir for parsing",
          "public_functions" => ["decode_file/1", "decode/1", "encode/1", "encode_to_file/2"]
        },
        %{
          "name" => "Bropilot.Pipeline.Engine",
          "path" => "lib/bropilot/pipeline/engine.ex",
          "responsibility" =>
            "GenServer holding pipeline position, step tracking, gate enforcement",
          "public_functions" => [
            "start_link/1",
            "current_step/1",
            "advance/1",
            "step_status/1",
            "mark_complete/2"
          ]
        },
        %{
          "name" => "Bropilot.Pipeline.Act1.Worker",
          "path" => "lib/bropilot/pipeline/act1/worker.ex",
          "responsibility" =>
            "GenServer for Act 1 vibe collection: step1 basics, step2 gory detail",
          "public_functions" => [
            "start_link/1",
            "run_step1/1",
            "run_step2/1",
            "submit_input/2",
            "next_question/1",
            "extract/1"
          ]
        },
        %{
          "name" => "Bropilot.Pipeline.Act2.Worker",
          "path" => "lib/bropilot/pipeline/act2/worker.ex",
          "responsibility" =>
            "GenServer for Act 2 domain modeling: step3 big picture, step4 specs",
          "public_functions" => [
            "start_link/1",
            "run_step3/1",
            "run_step4/1",
            "submit_extraction/2",
            "extract/1"
          ]
        },
        %{
          "name" => "Bropilot.Pipeline.Act3.Executor",
          "path" => "lib/bropilot/pipeline/act3/executor.ex",
          "responsibility" =>
            "Orchestrates full Act 3: snapshot, diff, tasks, feedback",
          "public_functions" => ["run/2", "run_step/3"]
        },
        %{
          "name" => "Bropilot.Pipeline.Act3.Snapshot",
          "path" => "lib/bropilot/pipeline/act3/snapshot.ex",
          "responsibility" =>
            "Creates versioned snapshots of problem + solution spaces",
          "public_functions" => [
            "create_snapshot/1",
            "latest_version/1",
            "read_snapshot/2",
            "list_versions/1"
          ]
        },
        %{
          "name" => "Bropilot.Pipeline.Act3.Diff",
          "path" => "lib/bropilot/pipeline/act3/diff.ex",
          "responsibility" => "Deep-diffs two snapshot maps, produces path-based change lists",
          "public_functions" => ["diff/2", "generate_change_plan/2", "summarize/1"]
        },
        %{
          "name" => "Bropilot.Pipeline.Act3.TaskGenerator",
          "path" => "lib/bropilot/pipeline/act3/task_generator.ex",
          "responsibility" =>
            "Generates work tasks from changes, writes task YAML files",
          "public_functions" => ["generate_tasks/1", "write_tasks/3", "read_tasks/2"]
        },
        %{
          "name" => "Bropilot.Pipeline.Feedback",
          "path" => "lib/bropilot/pipeline/feedback.ex",
          "responsibility" =>
            "Closes the feedback loop: updates changelog, xrefs, glossary after tasks",
          "public_functions" => [
            "update_knowledge/3",
            "update_changelog/2",
            "update_xrefs/2",
            "update_glossary/2",
            "summarize_version/2"
          ]
        },
        %{
          "name" => "Bropilot.LLM",
          "path" => "lib/bropilot/llm.ex",
          "responsibility" =>
            "Facade for LLM interactions: provider routing, YAML extraction",
          "public_functions" => ["chat/2", "extract_yaml/2", "provider/0"]
        },
        %{
          "name" => "Bropilot.Recipe.Registry",
          "path" => "lib/bropilot/recipe/registry.ex",
          "responsibility" => "Loads, validates, and caches recipe definitions",
          "public_functions" => ["start_link/1", "load/1", "get/0"]
        },
        %{
          "name" => "Bropilot.Recipe.Schema",
          "path" => "lib/bropilot/recipe/schema.ex",
          "responsibility" =>
            "Validates map data against recipe .schema.yaml files",
          "public_functions" => ["load_schema/1", "validate/2", "validate_map_slot/4"]
        },
        %{
          "name" => "Bropilot.Pi.Pool",
          "path" => "lib/bropilot/pi/pool.ex",
          "responsibility" =>
            "DynamicSupervisor managing pi coding-agent processes",
          "public_functions" => ["start_link/1", "checkout/1", "checkin/1"]
        },
        %{
          "name" => "Bropilot.Task.Agent",
          "path" => "lib/bropilot/task/agent.ex",
          "responsibility" =>
            "GenServer for a single codegen task: builds prompt, executes, updates knowledge",
          "public_functions" => ["start_link/2", "execute/1", "get_status/1", "get_result/1"]
        }
      ]
    })
  end

  defp write_spec_events(map_dir) do
    Storage.write(map_dir, :solution, :"specs/events", %{
      "events" => [
        %{
          "name" => "project_initialized",
          "trigger" => "Bropilot.init/2 succeeds",
          "data" => %{"project_path" => "string", "recipe" => "string"},
          "consumers" => ["CLI output"]
        },
        %{
          "name" => "step_completed",
          "trigger" => "Pipeline.Engine.mark_complete/2",
          "data" => %{"step_id" => "string", "space" => "atom"},
          "consumers" => ["Pipeline.Engine", "CLI status display"]
        },
        %{
          "name" => "gate_passed",
          "trigger" => "Spaces.validate_gate/2 returns :ok during advance",
          "data" => %{"from_space" => "atom", "to_space" => "atom"},
          "consumers" => ["Pipeline.Engine"]
        },
        %{
          "name" => "gate_failed",
          "trigger" => "Spaces.validate_gate/2 returns error during advance",
          "data" => %{
            "space" => "atom",
            "unfilled_slots" => "list of atoms"
          },
          "consumers" => ["Pipeline.Engine", "CLI error display"]
        },
        %{
          "name" => "extraction_done",
          "trigger" => "Act1.Worker.extract/1 or Act2.Worker.extract/1 succeeds",
          "data" => %{"step" => "atom", "slot_count" => "integer"},
          "consumers" => ["Map.Store (writes)", "CLI progress"]
        },
        %{
          "name" => "snapshot_created",
          "trigger" => "Act3.Snapshot.create_snapshot/1 succeeds",
          "data" => %{"version" => "integer", "spaces" => "list"},
          "consumers" => ["Act3.Diff", "CLI output"]
        },
        %{
          "name" => "changes_generated",
          "trigger" => "Act3.Diff.generate_change_plan/2 succeeds",
          "data" => %{
            "version" => "integer",
            "added" => "integer",
            "modified" => "integer",
            "removed" => "integer"
          },
          "consumers" => ["Act3.TaskGenerator", "CLI output"]
        },
        %{
          "name" => "task_dispatched",
          "trigger" => "Task.Agent.start_link/2",
          "data" => %{"task_id" => "integer", "title" => "string"},
          "consumers" => ["Task.Supervisor", "CLI task display"]
        },
        %{
          "name" => "task_completed",
          "trigger" => "Task.Agent sends {:task_completed, task_id}",
          "data" => %{"task_id" => "integer", "status" => "completed | failed"},
          "consumers" => ["Task.Supervisor", "Pipeline.Feedback"]
        },
        %{
          "name" => "knowledge_updated",
          "trigger" => "Pipeline.Feedback.update_knowledge/3 succeeds",
          "data" => %{
            "changelog_entry" => "map",
            "new_xrefs" => "integer",
            "new_terms" => "integer"
          },
          "consumers" => ["Knowledge Space files"]
        },
        %{
          "name" => "version_summarized",
          "trigger" => "Pipeline.Feedback.summarize_version/2 succeeds",
          "data" => %{
            "version" => "integer",
            "tasks_completed" => "integer",
            "artifacts_produced" => "integer"
          },
          "consumers" => ["Knowledge Space", "CLI summary"]
        }
      ]
    })
  end

  defp write_spec_externals(map_dir) do
    Storage.write(map_dir, :solution, :"specs/externals", %{
      "externals" => [
        %{
          "name" => "OpenRouter / Anthropic API",
          "type" => "LLM Provider",
          "description" =>
            "Primary LLM provider for extraction and codegen. Anthropic Claude models via direct API or OpenRouter.",
          "config" => "ANTHROPIC_API_KEY environment variable",
          "module" => "Bropilot.LLM.Anthropic",
          "fallback" => "OpenAI-compatible API"
        },
        %{
          "name" => "OpenAI API",
          "type" => "LLM Provider",
          "description" =>
            "Alternative LLM provider. GPT-4 and compatible models.",
          "config" => "OPENAI_API_KEY environment variable",
          "module" => "Bropilot.LLM.OpenAI",
          "fallback" => "Mock provider for testing"
        },
        %{
          "name" => "Cloudflare Pages",
          "type" => "Static Hosting",
          "description" =>
            "Hosts the Astro-based web UI (future). Edge-deployed for low latency.",
          "config" => "deploy.sh script",
          "module" => "N/A (deployment)"
        },
        %{
          "name" => "Fly.io",
          "type" => "Application Hosting",
          "description" =>
            "Hosts the Elixir OTP application for API access and long-running pipeline execution.",
          "config" => "fly.toml (future)",
          "module" => "Bropilot.Application"
        },
        %{
          "name" => "GitHub",
          "type" => "Version Control + CI",
          "description" =>
            "Source code hosting, PR-based workflow for codegen artifacts, CI/CD pipeline.",
          "config" => "Git remote",
          "module" => "N/A (external)"
        },
        %{
          "name" => "yaml_elixir",
          "type" => "Elixir Dependency",
          "description" => "YAML parsing library. Used by Bropilot.Yaml.decode_file/1 and decode/1.",
          "version" => "~> 2.11",
          "module" => "Bropilot.Yaml"
        },
        %{
          "name" => "Req",
          "type" => "Elixir Dependency",
          "description" =>
            "HTTP client for LLM API calls. Used by Anthropic and OpenAI providers.",
          "version" => "~> 0.5",
          "module" => "Bropilot.LLM.Anthropic, Bropilot.LLM.OpenAI"
        },
        %{
          "name" => "Jason",
          "type" => "Elixir Dependency",
          "description" => "JSON encoding/decoding for API request/response bodies.",
          "version" => "~> 1.4",
          "module" => "Bropilot.LLM.Anthropic, Bropilot.LLM.OpenAI"
        }
      ]
    })
  end

  defp write_spec_views(map_dir) do
    Storage.write(map_dir, :solution, :"specs/views", %{
      "views" => [
        %{
          "name" => "Dashboard",
          "path" => "/",
          "description" =>
            "Overview of project status: pipeline progress, space fill rates, latest version summary.",
          "data_sources" => [
            "Pipeline.Engine.step_status/1",
            "Spaces.validate_gate/2",
            "Act3.Snapshot.latest_version/1"
          ]
        },
        %{
          "name" => "Problem Space",
          "path" => "/problem",
          "description" =>
            "View and edit Problem Space data: audience, problem statement, context, assumptions, hypotheses, vibes.",
          "data_sources" => ["Map.Store.read/3 for :problem space"]
        },
        %{
          "name" => "Solution Space",
          "path" => "/solution",
          "description" =>
            "Browse Solution Space: vocabulary, domain model, flows, architecture, all 11 spec categories.",
          "data_sources" => ["Map.Store.read/3 for :solution space"]
        },
        %{
          "name" => "Work Space",
          "path" => "/work",
          "description" =>
            "Version history, change plans, task lists with status tracking.",
          "data_sources" => [
            "Act3.Snapshot.list_versions/1",
            "Act3.TaskGenerator.read_tasks/2"
          ]
        },
        %{
          "name" => "Knowledge Space",
          "path" => "/knowledge",
          "description" =>
            "Glossary, architectural decisions, changelog, cross-references.",
          "data_sources" => [
            "Pipeline.Feedback.glossary_path/1",
            "Pipeline.Feedback.changelog_path/1",
            "Pipeline.Feedback.xrefs_path/1"
          ]
        },
        %{
          "name" => "Vibe Chat",
          "path" => "/vibe",
          "description" =>
            "Conversational interface for Act 1 vibe collection. Step-by-step guided prompts.",
          "data_sources" => [
            "Act1.Worker.run_step1/1",
            "Act1.Worker.next_question/1"
          ]
        }
      ]
    })
  end

  defp write_spec_components(map_dir) do
    Storage.write(map_dir, :solution, :"specs/components", %{
      "components" => [
        %{
          "name" => "YamlCard",
          "description" =>
            "Renders a single YAML file's content as a structured card with collapsible sections.",
          "props" => ["data (map)", "title (string)", "editable (boolean)"],
          "used_in" => ["Problem Space", "Solution Space", "Knowledge Space"]
        },
        %{
          "name" => "SpaceStatus",
          "description" =>
            "Shows fill status for a space: filled slots, empty slots, gate pass/fail indicator.",
          "props" => ["space_id (atom)", "slots (list)", "gate_status (ok | error)"],
          "used_in" => ["Dashboard"]
        },
        %{
          "name" => "TaskBadge",
          "description" =>
            "Compact badge showing task priority and status with color coding.",
          "props" => ["priority (high | medium | low)", "status (pending | in_progress | completed | failed)"],
          "used_in" => ["Work Space"]
        },
        %{
          "name" => "SpecTable",
          "description" =>
            "Table view of spec entries (e.g., API endpoints, modules, events) with sorting and filtering.",
          "props" => ["specs (list of maps)", "columns (list of strings)", "sortable (boolean)"],
          "used_in" => ["Solution Space"]
        },
        %{
          "name" => "NavSidebar",
          "description" =>
            "Navigation sidebar with space icons, pipeline progress indicator, and quick links.",
          "props" => ["current_path (string)", "pipeline_status (map)"],
          "used_in" => ["All views (layout component)"]
        },
        %{
          "name" => "PipelineProgress",
          "description" =>
            "Visual pipeline progress bar showing acts and steps with completion status.",
          "props" => ["steps (list)", "current_step (string)", "completed (list)"],
          "used_in" => ["Dashboard", "NavSidebar"]
        },
        %{
          "name" => "DiffViewer",
          "description" =>
            "Shows changes between two versions with added/modified/removed highlighting.",
          "props" => ["changes (list)", "version (integer)"],
          "used_in" => ["Work Space"]
        },
        %{
          "name" => "GlossaryList",
          "description" =>
            "Alphabetical list of glossary terms with definitions, source space, and first-seen step.",
          "props" => ["terms (list of maps)", "filterable (boolean)"],
          "used_in" => ["Knowledge Space"]
        }
      ]
    })
  end

  defp write_spec_streams(map_dir) do
    Storage.write(map_dir, :solution, :"specs/streams", %{
      "streams" => [
        %{
          "name" => "Pipeline Status Stream",
          "protocol" => "WebSocket",
          "path" => "/ws/pipeline",
          "description" =>
            "Real-time pipeline progress updates. Pushes step completion, gate results, and extraction progress.",
          "events" => [
            "step_started",
            "step_completed",
            "gate_passed",
            "gate_failed",
            "extraction_progress"
          ]
        },
        %{
          "name" => "Task Execution Stream",
          "protocol" => "WebSocket",
          "path" => "/ws/tasks",
          "description" =>
            "Real-time task status updates during Act 3 build cycles.",
          "events" => [
            "task_dispatched",
            "task_progress",
            "task_completed",
            "task_failed"
          ]
        },
        %{
          "name" => "Vibe Chat Stream",
          "protocol" => "WebSocket",
          "path" => "/ws/vibe",
          "description" =>
            "Streaming LLM responses during vibe collection for a conversational feel.",
          "events" => [
            "prompt_ready",
            "llm_chunk",
            "extraction_complete"
          ]
        }
      ]
    })
  end

  defp write_spec_infra(map_dir) do
    Storage.write(map_dir, :solution, :"specs/infra", %{
      "infra" => [
        %{
          "name" => "Elixir Runtime",
          "type" => "Application Server",
          "description" =>
            "BEAM VM running the OTP application. Handles pipeline execution, LLM calls, and task dispatch.",
          "hosting" => "Fly.io (production), local (development)",
          "requirements" => ["Elixir ~> 1.19", "Erlang/OTP", "Mix build tool"]
        },
        %{
          "name" => "Cloudflare Pages",
          "type" => "Static Site Hosting",
          "description" =>
            "Hosts the Astro-based web UI. Edge-deployed for global low latency.",
          "hosting" => "Cloudflare",
          "requirements" => ["Node.js for build", "Astro framework"]
        },
        %{
          "name" => "OpenRouter",
          "type" => "LLM Gateway",
          "description" =>
            "Unified API gateway for multiple LLM providers. Allows switching between Claude, GPT-4, and others without code changes.",
          "hosting" => "SaaS",
          "requirements" => ["API key", "HTTPS access"]
        },
        %{
          "name" => "File System",
          "type" => "Data Storage",
          "description" =>
            "All project data stored as YAML files in .bropilot/. No database required. Git-friendly.",
          "hosting" => "Local + version control",
          "requirements" => ["Read/write access to project directory"]
        }
      ]
    })
  end

  # ── Work Space ─────────────────────────────────────────────────────────

  defp populate_work_space(map_dir) do
    version_dir = Path.join([map_dir, "work", "versions", "v001"])
    File.mkdir_p!(version_dir)
    tasks_dir = Path.join(version_dir, "tasks")
    File.mkdir_p!(tasks_dir)

    # Snapshot — simplified summary of problem + solution for v001
    Bropilot.Yaml.encode_to_file(
      %{
        "version" => 1,
        "timestamp" => "2025-06-01T00:00:00Z",
        "problem" => %{
          "audience" => "Developers and technical founders",
          "problem" =>
            "No tool bridges fuzzy ideas to structured specs for coding agents",
          "context" =>
            "AI coding tools are good at coding but bad at knowing what to code"
        },
        "solution" => %{
          "vocabulary_count" => 20,
          "entity_count" => 9,
          "spec_categories" => 11,
          "api_endpoint_count" => 12,
          "module_count" => 18
        }
      },
      Path.join(version_dir, "snapshot.yaml")
    )

    # Changes — everything is new in v001
    Bropilot.Yaml.encode_to_file(
      %{
        "changes" => [
          %{
            "path" => "problem.audience",
            "type" => "added",
            "old_value" => nil,
            "new_value" => "Developers and technical founders"
          },
          %{
            "path" => "problem.problem",
            "type" => "added",
            "old_value" => nil,
            "new_value" => "No tool bridges fuzzy ideas to structured specs"
          },
          %{
            "path" => "solution.vocabulary",
            "type" => "added",
            "old_value" => nil,
            "new_value" => "20 terms defined"
          },
          %{
            "path" => "solution.domain.entities",
            "type" => "added",
            "old_value" => nil,
            "new_value" => "9 entities defined"
          },
          %{
            "path" => "solution.specs",
            "type" => "added",
            "old_value" => nil,
            "new_value" => "11 spec categories with detailed entries"
          }
        ]
      },
      Path.join(version_dir, "changes.yaml")
    )

    # Tasks
    tasks = [
      %{
        "id" => 1,
        "title" => "Implement Bropilot.init/2 with three-tier scaffolding",
        "description" =>
          "Create the project initialization function that sets up .bropilot/ with spaces.lock, recipe copy, and empty map directory structure.",
        "context" => %{
          "related_module" => "Bropilot",
          "space" => "problem + solution + work"
        },
        "definition_of_done" => [
          "Bropilot.init(path) creates .bropilot/ directory",
          "spaces.lock is written with all 5 space definitions",
          "Default webapp recipe is copied to .bropilot/recipe/",
          "Empty map directories are scaffolded for all spaces",
          "Tests pass for init with default and custom paths"
        ],
        "dependencies" => [],
        "priority" => "high",
        "related_specs" => ["solution.specs.modules.Bropilot", "solution.specs.entities.Project"],
        "status" => "completed"
      },
      %{
        "id" => 2,
        "title" => "Build Pipeline.Engine GenServer with gate validation",
        "description" =>
          "Implement the pipeline execution engine that tracks step position, enforces space-gate validation, and manages step completion.",
        "context" => %{
          "related_module" => "Bropilot.Pipeline.Engine",
          "space" => "solution"
        },
        "definition_of_done" => [
          "Engine starts with recipe loaded from Registry",
          "current_step/1 returns the active step",
          "advance/1 checks gate validation when crossing spaces",
          "mark_complete/2 tracks completed steps",
          "step_status/1 returns status map for all steps"
        ],
        "dependencies" => [1],
        "priority" => "high",
        "related_specs" => [
          "solution.specs.modules.Pipeline.Engine",
          "solution.specs.behaviours.Gate_Validation"
        ],
        "status" => "completed"
      },
      %{
        "id" => 3,
        "title" => "Implement Act 1 vibe collection workers",
        "description" =>
          "Build the Act1.Worker GenServer and Extractor for collecting user vibes and extracting structured data into the Problem Space.",
        "context" => %{
          "related_module" => "Bropilot.Pipeline.Act1.Worker",
          "space" => "problem"
        },
        "definition_of_done" => [
          "Step 1 returns basics prompt, accepts freeform input",
          "Step 2 walks through 6 targeted questions",
          "Mock extraction returns hardcoded structured data",
          "LLM extraction sends prompt and parses YAML response",
          "Extracted data is written to Problem Space map slots"
        ],
        "dependencies" => [1, 2],
        "priority" => "high",
        "related_specs" => [
          "solution.specs.modules.Act1.Worker",
          "solution.specs.events.extraction_done"
        ],
        "status" => "completed"
      },
      %{
        "id" => 4,
        "title" => "Implement Act 3 snapshot, diff, and task generation",
        "description" =>
          "Build the Act 3 pipeline: version snapshots, change plan diffs, and task generation with context and definitions of done.",
        "context" => %{
          "related_module" => "Bropilot.Pipeline.Act3.Executor",
          "space" => "work"
        },
        "definition_of_done" => [
          "Snapshot reads problem + solution recursively and writes versioned YAML",
          "Diff produces path-based change list (added, modified, removed)",
          "TaskGenerator creates one task per change with full context",
          "Tasks are written as individual YAML files in versions/v{NNN}/tasks/",
          "Executor orchestrates full flow: snapshot -> diff -> tasks -> feedback"
        ],
        "dependencies" => [2, 3],
        "priority" => "high",
        "related_specs" => [
          "solution.specs.modules.Act3.Executor",
          "solution.specs.modules.Act3.Snapshot",
          "solution.specs.modules.Act3.Diff"
        ],
        "status" => "completed"
      },
      %{
        "id" => 5,
        "title" => "Implement Knowledge Space feedback loop",
        "description" =>
          "Build the Pipeline.Feedback module that updates changelog, cross-references, and glossary after each completed task.",
        "context" => %{
          "related_module" => "Bropilot.Pipeline.Feedback",
          "space" => "knowledge"
        },
        "definition_of_done" => [
          "update_changelog/2 appends timestamped entries",
          "update_xrefs/2 maps specs to artifact paths (deduplicated)",
          "update_glossary/2 merges new terms (latest definition wins)",
          "summarize_version/2 writes version summary with stats",
          "All knowledge files are valid YAML parseable by yaml_elixir"
        ],
        "dependencies" => [4],
        "priority" => "medium",
        "related_specs" => [
          "solution.specs.modules.Pipeline.Feedback",
          "solution.specs.events.knowledge_updated"
        ],
        "status" => "completed"
      }
    ]

    Enum.each(tasks, fn task ->
      filename =
        "task-" <> String.pad_leading(Integer.to_string(task["id"]), 3, "0") <> ".yaml"

      Bropilot.Yaml.encode_to_file(task, Path.join(tasks_dir, filename))
    end)
  end

  # ── Measurement Space ──────────────────────────────────────────────────

  defp populate_measurement_space(map_dir) do
    # Validation: Problem assumptions
    Storage.write(map_dir, :measurement, :"validation/problem/assumptions", %{
      "validation_type" => "assumption_review",
      "space" => "problem",
      "timestamp" => "2025-06-01T00:00:00Z",
      "results" => [
        %{
          "assumption_id" => "A1",
          "statement" =>
            "Developers want structured thinking before coding but find it tedious to do manually",
          "status" => "validated",
          "evidence" =>
            "User interviews with 15+ developers confirmed this pattern. 80% said they skip planning because it feels like overhead."
        },
        %{
          "assumption_id" => "A2",
          "statement" =>
            "LLMs can reliably extract structured data (YAML) from freeform input",
          "status" => "partially_validated",
          "evidence" =>
            "Works well with clear prompts and system instructions. Occasional formatting issues with deeply nested structures."
        },
        %{
          "assumption_id" => "A3",
          "statement" =>
            "A 5-space model covers all aspects of app building",
          "status" => "validated",
          "evidence" =>
            "Mapped against 20+ real projects. No category of work fell outside the 5 spaces."
        },
        %{
          "assumption_id" => "A5",
          "statement" =>
            "YAML is a sufficient interchange format for specs consumed by coding agents",
          "status" => "validated",
          "evidence" =>
            "Both Claude and GPT-4 parse YAML specs correctly. Human readability is a bonus for debugging."
        }
      ]
    })

    # Validation: Solution consistency
    Storage.write(map_dir, :measurement, :"validation/solution/consistency", %{
      "validation_type" => "spec_consistency",
      "space" => "solution",
      "timestamp" => "2025-06-01T00:00:00Z",
      "checks" => [
        %{
          "check" => "All vocabulary terms referenced in specs exist in vocabulary.yaml",
          "status" => "pass",
          "details" => "20 terms defined, all referenced correctly"
        },
        %{
          "check" => "All module specs reference real source files",
          "status" => "pass",
          "details" => "18 modules mapped to actual lib/ paths"
        },
        %{
          "check" => "Entity relationships reference defined entities",
          "status" => "pass",
          "details" => "9 relationships, all entities exist"
        },
        %{
          "check" => "API endpoints reference existing modules",
          "status" => "pass",
          "details" => "12 endpoints, all module references valid"
        },
        %{
          "check" => "Event consumers reference existing modules or spaces",
          "status" => "pass",
          "details" => "11 events, all consumer references valid"
        }
      ],
      "overall" => "pass"
    })

    # Validation: Work test results
    Storage.write(map_dir, :measurement, :"validation/work/test-results", %{
      "validation_type" => "test_suite",
      "space" => "work",
      "timestamp" => "2025-06-01T00:00:00Z",
      "summary" => %{
        "total_tests" => 219,
        "passed" => 219,
        "failed" => 0,
        "excluded" => 0,
        "time_seconds" => 2.4
      },
      "test_files" => [
        %{"file" => "test/bropilot_test.exs", "tests" => 12, "passed" => 12},
        %{"file" => "test/init_test.exs", "tests" => 8, "passed" => 8},
        %{"file" => "test/pipeline_test.exs", "tests" => 18, "passed" => 18},
        %{"file" => "test/act1_test.exs", "tests" => 24, "passed" => 24},
        %{"file" => "test/act2_test.exs", "tests" => 22, "passed" => 22},
        %{"file" => "test/act3_test.exs", "tests" => 28, "passed" => 28},
        %{"file" => "test/feedback_test.exs", "tests" => 20, "passed" => 20},
        %{"file" => "test/llm_test.exs", "tests" => 15, "passed" => 15},
        %{"file" => "test/recipe_test.exs", "tests" => 14, "passed" => 14},
        %{"file" => "test/schema_test.exs", "tests" => 16, "passed" => 16},
        %{"file" => "test/task_test.exs", "tests" => 18, "passed" => 18},
        %{"file" => "test/executor_test.exs", "tests" => 12, "passed" => 12},
        %{"file" => "test/cli_helpers_test.exs", "tests" => 8, "passed" => 8},
        %{"file" => "test/recipe_installer_test.exs", "tests" => 4, "passed" => 4}
      ],
      "coverage" => "N/A"
    })
  end

  # ── Knowledge Space ────────────────────────────────────────────────────

  defp populate_knowledge_space(map_dir) do
    write_glossary(map_dir)
    write_decisions(map_dir)
    write_changelog(map_dir)
    write_xrefs(map_dir)
  end

  defp write_glossary(map_dir) do
    Bropilot.Yaml.encode_to_file(
      %{
        "terms" => [
          %{
            "term" => "Act",
            "definition" =>
              "A major phase of the pipeline. Act 1: Vibe Collection, Act 2: Domain Modeling, Act 3: Build.",
            "source_space" => "solution",
            "first_seen_step" => "step3"
          },
          %{
            "term" => "Artifact",
            "definition" =>
              "A concrete output produced by a task: source files, tests, database interfaces, debug logs.",
            "source_space" => "solution",
            "first_seen_step" => "step4"
          },
          %{
            "term" => "Diff",
            "definition" =>
              "A path-based comparison between two snapshots that identifies added, modified, and removed specs.",
            "source_space" => "solution",
            "first_seen_step" => "step3"
          },
          %{
            "term" => "Domain Model",
            "definition" =>
              "Entities, relationships, and flows that describe the app's problem and solution domains.",
            "source_space" => "solution",
            "first_seen_step" => "step3"
          },
          %{
            "term" => "Extraction",
            "definition" =>
              "The process of converting freeform LLM output into structured YAML data that populates map slots.",
            "source_space" => "solution",
            "first_seen_step" => "step3"
          },
          %{
            "term" => "Feedback Loop",
            "definition" =>
              "The mechanism by which completed tasks update the Knowledge Space, keeping specs aligned with reality.",
            "source_space" => "solution",
            "first_seen_step" => "step4"
          },
          %{
            "term" => "Gate",
            "definition" =>
              "A validation checkpoint between spaces. All required slots must be filled before advancing.",
            "source_space" => "solution",
            "first_seen_step" => "step3"
          },
          %{
            "term" => "Map",
            "definition" =>
              "The user-level data layer. YAML files in .bropilot/map/ organized by space.",
            "source_space" => "solution",
            "first_seen_step" => "step3"
          },
          %{
            "term" => "Pi",
            "definition" =>
              "A coding agent process managed by the Pi Pool. Receives task prompts and produces code artifacts.",
            "source_space" => "solution",
            "first_seen_step" => "step4"
          },
          %{
            "term" => "Pipeline",
            "definition" =>
              "The ordered sequence of acts and steps that transform vibes into specs into code.",
            "source_space" => "solution",
            "first_seen_step" => "step3"
          },
          %{
            "term" => "Recipe",
            "definition" =>
              "A superuser-level configuration defining pipeline steps, prompts, schemas, and validations.",
            "source_space" => "solution",
            "first_seen_step" => "step3"
          },
          %{
            "term" => "Slot",
            "definition" =>
              "A named data location within a space. Can be a file (.yaml) or a directory.",
            "source_space" => "solution",
            "first_seen_step" => "step3"
          },
          %{
            "term" => "Snapshot",
            "definition" =>
              "A frozen copy of the problem and solution spaces at a point in time. Creates a version.",
            "source_space" => "solution",
            "first_seen_step" => "step3"
          },
          %{
            "term" => "Space",
            "definition" =>
              "One of 5 immutable thinking categories: Problem, Solution, Work, Measurement, Knowledge.",
            "source_space" => "problem",
            "first_seen_step" => "step1"
          },
          %{
            "term" => "Spec",
            "definition" =>
              "A detailed specification file in map/solution/specs/. Covers API, behaviours, constraints, entities, modules, events, externals, views, components, streams, infra.",
            "source_space" => "solution",
            "first_seen_step" => "step4"
          },
          %{
            "term" => "Step",
            "definition" =>
              "A single unit of work within an act. Each step maps to a primary space.",
            "source_space" => "solution",
            "first_seen_step" => "step3"
          },
          %{
            "term" => "Task",
            "definition" =>
              "A work item generated from a diff change. Contains title, description, context, definition of done, priority, related specs.",
            "source_space" => "work",
            "first_seen_step" => "step7"
          },
          %{
            "term" => "Three-Tier Model",
            "definition" =>
              "The authority hierarchy: Spaces (immutable) > Recipe (superuser) > Map (user data).",
            "source_space" => "problem",
            "first_seen_step" => "step1"
          },
          %{
            "term" => "Vibe",
            "definition" =>
              "Freeform, conversational input from the user about their app idea. Collected in Act 1.",
            "source_space" => "problem",
            "first_seen_step" => "step1"
          },
          %{
            "term" => "VOLO",
            "definition" =>
              "Vision of Lovable Output. A one-sentence description of what the finished product feels like.",
            "source_space" => "problem",
            "first_seen_step" => "step2"
          }
        ]
      },
      Path.join([map_dir, "knowledge", "glossary.yaml"])
    )
  end

  defp write_decisions(map_dir) do
    decisions_dir = Path.join([map_dir, "knowledge", "decisions"])
    File.mkdir_p!(decisions_dir)

    Bropilot.Yaml.encode_to_file(
      %{
        "title" => "Why Elixir",
        "date" => "2025-01-15",
        "status" => "accepted",
        "context" =>
          "Needed a language for building the core pipeline engine with reliable concurrency, fault tolerance, and a strong process model.",
        "decision" =>
          "Use Elixir/OTP as the primary language. GenServers for pipeline engine, act workers, and task agents. DynamicSupervisor for Pi pool management.",
        "alternatives_considered" => [
          %{
            "name" => "TypeScript/Node.js",
            "reason_rejected" =>
              "Single-threaded event loop. Would need external process management for concurrent task execution."
          },
          %{
            "name" => "Go",
            "reason_rejected" =>
              "Good concurrency but lacks the supervision tree model. Error handling less elegant for long-running pipelines."
          },
          %{
            "name" => "Python",
            "reason_rejected" =>
              "GIL limits true concurrency. Would need multiprocessing or external task queues."
          }
        ],
        "consequences" => [
          "Excellent concurrency and fault tolerance via OTP",
          "Pattern matching and immutable data structures suit YAML processing",
          "Mix provides first-class CLI task support",
          "Smaller ecosystem than Node.js — fewer UI libraries"
        ],
        "source_step" => "step3"
      },
      Path.join(decisions_dir, "why-elixir.yaml")
    )

    Bropilot.Yaml.encode_to_file(
      %{
        "title" => "Why OpenRouter",
        "date" => "2025-02-01",
        "status" => "accepted",
        "context" =>
          "Need access to multiple LLM providers (Claude, GPT-4, open models) without hardcoding to a single API.",
        "decision" =>
          "Support direct Anthropic and OpenAI APIs as primary providers, with OpenRouter as a unified gateway for flexibility. Provider auto-detection based on environment variables.",
        "alternatives_considered" => [
          %{
            "name" => "Anthropic-only",
            "reason_rejected" =>
              "Lock-in to single provider. Users may prefer GPT-4 or open models."
          },
          %{
            "name" => "LiteLLM proxy",
            "reason_rejected" =>
              "Additional infrastructure dependency. OpenRouter is simpler for end users."
          }
        ],
        "consequences" => [
          "Users can switch LLM providers by changing an env var",
          "Mock provider enables testing without API keys",
          "Bropilot.LLM facade abstracts provider differences"
        ],
        "source_step" => "step4"
      },
      Path.join(decisions_dir, "why-openrouter.yaml")
    )

    Bropilot.Yaml.encode_to_file(
      %{
        "title" => "Why Five Spaces",
        "date" => "2025-01-10",
        "status" => "accepted",
        "context" =>
          "Needed a universal framework for categorizing all aspects of app building. Must be exhaustive (nothing falls outside) and immutable (recipes can't change the categories).",
        "decision" =>
          "Define 5 immutable spaces: Problem (why), Solution (what), Work (how/when), Measurement (validation), Knowledge (documentation). Problem/Solution/Work are primary; Measurement and Knowledge are cross-cutting.",
        "alternatives_considered" => [
          %{
            "name" => "3 spaces (Problem, Solution, Work)",
            "reason_rejected" =>
              "Missing validation and documentation as first-class concerns. They get neglected."
          },
          %{
            "name" => "7+ spaces with finer granularity",
            "reason_rejected" =>
              "Too many categories creates confusion. 5 is the sweet spot — covers everything without overhead."
          },
          %{
            "name" => "Configurable spaces per recipe",
            "reason_rejected" =>
              "Defeats the purpose of a universal framework. Recipes should configure steps, not spaces."
          }
        ],
        "consequences" => [
          "Every piece of project data has a clear home",
          "Cross-cutting spaces ensure validation and docs are never forgotten",
          "Gate validation enforces discipline at space boundaries",
          "New recipes work with the same 5 spaces — universal compatibility"
        ],
        "source_step" => "step3"
      },
      Path.join(decisions_dir, "why-five-spaces.yaml")
    )

    Bropilot.Yaml.encode_to_file(
      %{
        "title" => "Why Three-Tier Authority Model",
        "date" => "2025-01-12",
        "status" => "accepted",
        "context" =>
          "Need to separate concerns between immutable framework structure, configurable pipeline behavior, and user-generated project data.",
        "decision" =>
          "Three tiers of authority: Spaces (immutable core, defined in code), Recipe (superuser config, YAML-based), Map (user data, filled by pipeline). Each tier has clear ownership and modification rules.",
        "alternatives_considered" => [
          %{
            "name" => "Two tiers (framework + user data)",
            "reason_rejected" =>
              "No room for recipe customization. Every project would follow the same pipeline."
          },
          %{
            "name" => "Flat configuration",
            "reason_rejected" =>
              "No authority hierarchy. Users could accidentally break structural invariants."
          }
        ],
        "consequences" => [
          "Clear separation of concerns: what changes vs what doesn't",
          "Recipes can customize pipeline without breaking space guarantees",
          "Map data is safely isolated — users can experiment freely",
          "spaces.lock provides a machine-readable contract"
        ],
        "source_step" => "step3"
      },
      Path.join(decisions_dir, "why-three-tier-model.yaml")
    )
  end

  defp write_changelog(map_dir) do
    Bropilot.Yaml.encode_to_file(
      %{
        "entries" => [
          %{
            "task_id" => 1,
            "title" => "Implement Bropilot.init/2 with three-tier scaffolding",
            "timestamp" => "2025-03-01T10:00:00Z",
            "files_touched" => [
              "lib/bropilot.ex",
              "lib/bropilot/spaces/spaces.ex",
              "lib/bropilot/spaces/space.ex"
            ],
            "status" => "completed",
            "version" => 1,
            "related_specs" => [
              "solution.specs.modules.Bropilot",
              "solution.specs.entities.Project"
            ]
          },
          %{
            "task_id" => 2,
            "title" => "Build Pipeline.Engine GenServer with gate validation",
            "timestamp" => "2025-03-15T14:30:00Z",
            "files_touched" => [
              "lib/bropilot/pipeline/engine.ex",
              "lib/bropilot/pipeline/supervisor.ex"
            ],
            "status" => "completed",
            "version" => 1,
            "related_specs" => [
              "solution.specs.modules.Pipeline.Engine",
              "solution.specs.behaviours.Gate_Validation"
            ]
          },
          %{
            "task_id" => 3,
            "title" => "Implement Act 1 vibe collection workers",
            "timestamp" => "2025-04-01T09:00:00Z",
            "files_touched" => [
              "lib/bropilot/pipeline/act1/worker.ex",
              "lib/bropilot/pipeline/act1/extractor.ex"
            ],
            "status" => "completed",
            "version" => 1,
            "related_specs" => [
              "solution.specs.modules.Act1.Worker",
              "solution.specs.events.extraction_done"
            ]
          },
          %{
            "task_id" => 4,
            "title" => "Implement Act 3 snapshot, diff, and task generation",
            "timestamp" => "2025-05-01T11:00:00Z",
            "files_touched" => [
              "lib/bropilot/pipeline/act3/executor.ex",
              "lib/bropilot/pipeline/act3/snapshot.ex",
              "lib/bropilot/pipeline/act3/diff.ex",
              "lib/bropilot/pipeline/act3/task_generator.ex"
            ],
            "status" => "completed",
            "version" => 1,
            "related_specs" => [
              "solution.specs.modules.Act3.Executor",
              "solution.specs.modules.Act3.Snapshot"
            ]
          },
          %{
            "task_id" => 5,
            "title" => "Implement Knowledge Space feedback loop",
            "timestamp" => "2025-05-15T16:00:00Z",
            "files_touched" => ["lib/bropilot/pipeline/feedback.ex"],
            "status" => "completed",
            "version" => 1,
            "related_specs" => [
              "solution.specs.modules.Pipeline.Feedback",
              "solution.specs.events.knowledge_updated"
            ]
          }
        ]
      },
      Path.join([map_dir, "knowledge", "changelog.yaml"])
    )
  end

  defp write_xrefs(map_dir) do
    Bropilot.Yaml.encode_to_file(
      %{
        "xrefs" => [
          %{
            "term" => "Space",
            "spec_path" => "solution.specs.modules.Bropilot.Spaces",
            "artifact_path" => "lib/bropilot/spaces/spaces.ex"
          },
          %{
            "term" => "Map",
            "spec_path" => "solution.specs.modules.Bropilot.Map.Store",
            "artifact_path" => "lib/bropilot/map/store.ex"
          },
          %{
            "term" => "Pipeline",
            "spec_path" => "solution.specs.modules.Bropilot.Pipeline.Engine",
            "artifact_path" => "lib/bropilot/pipeline/engine.ex"
          },
          %{
            "term" => "Recipe",
            "spec_path" => "solution.specs.modules.Bropilot.Recipe.Registry",
            "artifact_path" => "lib/bropilot/recipe/registry.ex"
          },
          %{
            "term" => "Gate",
            "spec_path" => "solution.specs.behaviours.Gate_Validation",
            "artifact_path" => "lib/bropilot/spaces/spaces.ex"
          },
          %{
            "term" => "Extraction",
            "spec_path" => "solution.specs.behaviours.LLM_Extraction",
            "artifact_path" => "lib/bropilot/llm.ex"
          },
          %{
            "term" => "Snapshot",
            "spec_path" => "solution.specs.modules.Act3.Snapshot",
            "artifact_path" => "lib/bropilot/pipeline/act3/snapshot.ex"
          },
          %{
            "term" => "Diff",
            "spec_path" => "solution.specs.modules.Act3.Diff",
            "artifact_path" => "lib/bropilot/pipeline/act3/diff.ex"
          },
          %{
            "term" => "Task",
            "spec_path" => "solution.specs.modules.Act3.TaskGenerator",
            "artifact_path" => "lib/bropilot/pipeline/act3/task_generator.ex"
          },
          %{
            "term" => "Feedback Loop",
            "spec_path" => "solution.specs.modules.Pipeline.Feedback",
            "artifact_path" => "lib/bropilot/pipeline/feedback.ex"
          },
          %{
            "term" => "Pi",
            "spec_path" => "solution.specs.modules.Pi.Pool",
            "artifact_path" => "lib/bropilot/pi/pool.ex"
          },
          %{
            "term" => "Vibe",
            "spec_path" => "solution.specs.modules.Act1.Worker",
            "artifact_path" => "lib/bropilot/pipeline/act1/worker.ex"
          },
          %{
            "term" => "YAML",
            "spec_path" => "solution.specs.modules.Bropilot.Yaml",
            "artifact_path" => "lib/bropilot/yaml.ex"
          },
          %{
            "term" => "Schema Validation",
            "spec_path" => "solution.specs.modules.Recipe.Schema",
            "artifact_path" => "lib/bropilot/recipe/schema.ex"
          }
        ]
      },
      Path.join([map_dir, "knowledge", "xrefs.yaml"])
    )
  end
end
