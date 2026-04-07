defmodule Bropilot.Pipeline.Act2.Extractor do
  @moduledoc """
  Pure functions for building extraction prompts and parsing outputs for Act 2.
  Handles Step 3 (domain model / big picture) and Step 4 (specs expansion).
  """

  @doc """
  Builds the full extraction prompt for Step 3 by combining
  the recipe's step3 prompt with all Problem Space data and guiding questions.
  """
  def build_step3_prompt(recipe_prompt, problem_data, guiding_questions) do
    problem_section = format_problem_data(problem_data)
    questions_section = format_guiding_questions(guiding_questions)

    """
    #{String.trim(recipe_prompt)}

    ---

    Problem Space Data:
    #{problem_section}

    ---

    Guiding Questions:
    #{questions_section}

    ---

    Generate the domain model as YAML with the following sections:
    - vocabulary (list of {term, definition, aliases, category})
    - entities (list of {name, description, attributes, relationships})
    - relationships (list of {source, target, type, description})
    - user_flows (list of {name, actor, trigger, steps, outcome, touches})
    - system_flows (list of {name, trigger, steps, outcome})
    - architecture_components (list of {component, responsibility, type, depends_on})
    - architecture_dependencies (list of {source, target, description})
    - glossary_terms (list of {term, definition})
    - decisions (list of {title, rationale, status})
    """
  end

  @doc """
  Builds the full extraction prompt for Step 4 by combining
  the recipe's step4 prompt with the domain model data.
  """
  def build_step4_prompt(recipe_prompt, domain_data) do
    domain_section = format_domain_data(domain_data)

    """
    #{String.trim(recipe_prompt)}

    ---

    Domain Model:
    #{domain_section}

    ---

    Generate detailed specifications as YAML for all 11 categories:
    - api (list of endpoints)
    - behaviours (list of when/given/then specs)
    - constraints (list of business rules)
    - entities (list of DB-level entity specs)
    - modules (list of code modules)
    - events (list of system events)
    - externals (list of external integrations)
    - views (list of UI views)
    - components (list of UI components)
    - streams (list of data flows)
    - infra (list of infrastructure specs)
    - glossary_terms (list of {term, definition})
    - decisions (list of {title, rationale, status})
    """
  end

  @doc """
  Parses extracted YAML string from Step 3 into a structured map.
  """
  def parse_domain_output(yaml_string) do
    Bropilot.Yaml.decode(yaml_string)
  end

  @doc """
  Parses extracted YAML string from Step 4 into a structured map.
  """
  def parse_specs_output(yaml_string) do
    Bropilot.Yaml.decode(yaml_string)
  end

  @doc """
  Returns realistic mock domain model data for testing.
  Models a simple TodoApp with User, Task, Workspace entities.
  """
  def mock_domain_data do
    %{
      "vocabulary" => [
        %{
          "term" => "User",
          "definition" => "A person who uses the TodoApp",
          "aliases" => ["member", "account"],
          "category" => "entity"
        },
        %{
          "term" => "Task",
          "definition" => "A unit of work to be completed",
          "aliases" => ["todo", "item"],
          "category" => "entity"
        },
        %{
          "term" => "Workspace",
          "definition" => "A shared space for team collaboration",
          "aliases" => ["project", "board"],
          "category" => "entity"
        },
        %{
          "term" => "Assignee",
          "definition" => "The user responsible for completing a task",
          "aliases" => ["owner"],
          "category" => "role"
        },
        %{
          "term" => "Due Date",
          "definition" => "The deadline for task completion",
          "aliases" => ["deadline"],
          "category" => "concept"
        }
      ],
      "entities" => [
        %{
          "name" => "User",
          "description" => "A registered user of the application",
          "attributes" => %{
            "id" => "uuid",
            "email" => "string",
            "name" => "string",
            "role" => "enum(admin, member)"
          },
          "relationships" => [
            %{
              "target" => "Task",
              "type" => "has_many",
              "description" => "Tasks assigned to the user"
            },
            %{
              "target" => "Workspace",
              "type" => "belongs_to",
              "description" => "Workspace the user belongs to"
            }
          ]
        },
        %{
          "name" => "Task",
          "description" => "A work item that can be created, assigned, and completed",
          "attributes" => %{
            "id" => "uuid",
            "title" => "string",
            "description" => "text",
            "status" => "enum(todo, in_progress, done)",
            "due_date" => "datetime",
            "priority" => "enum(low, medium, high)"
          },
          "relationships" => [
            %{
              "target" => "User",
              "type" => "belongs_to",
              "description" => "Assigned user"
            },
            %{
              "target" => "Workspace",
              "type" => "belongs_to",
              "description" => "Parent workspace"
            }
          ]
        },
        %{
          "name" => "Workspace",
          "description" => "A container for organizing tasks and team members",
          "attributes" => %{
            "id" => "uuid",
            "name" => "string",
            "description" => "text"
          },
          "relationships" => [
            %{
              "target" => "User",
              "type" => "has_many",
              "description" => "Workspace members"
            },
            %{
              "target" => "Task",
              "type" => "has_many",
              "description" => "Tasks in the workspace"
            }
          ]
        }
      ],
      "relationships" => [
        %{
          "source" => "User",
          "target" => "Task",
          "type" => "has_many",
          "description" => "A user can have many assigned tasks"
        },
        %{
          "source" => "Workspace",
          "target" => "Task",
          "type" => "has_many",
          "description" => "A workspace contains many tasks"
        },
        %{
          "source" => "User",
          "target" => "Workspace",
          "type" => "belongs_to",
          "description" => "A user belongs to a workspace"
        },
        %{
          "source" => "Task",
          "target" => "User",
          "type" => "belongs_to",
          "description" => "A task is assigned to a user"
        }
      ],
      "user_flows" => [
        %{
          "name" => "Create Task",
          "actor" => "User",
          "trigger" => "User clicks 'New Task' button",
          "steps" => [
            "Open task form",
            "Fill in title and description",
            "Set priority and due date",
            "Submit task"
          ],
          "outcome" => "New task appears in workspace",
          "touches" => ["Task", "Workspace"]
        },
        %{
          "name" => "Assign Task",
          "actor" => "User",
          "trigger" => "User selects assignee on task",
          "steps" => [
            "Open task detail",
            "Select assignee from team",
            "Confirm assignment"
          ],
          "outcome" => "Task is assigned and assignee notified",
          "touches" => ["Task", "User"]
        },
        %{
          "name" => "Complete Task",
          "actor" => "User",
          "trigger" => "User marks task as done",
          "steps" => [
            "Click complete button",
            "Task status changes to done"
          ],
          "outcome" => "Task moved to completed list",
          "touches" => ["Task"]
        }
      ],
      "system_flows" => [
        %{
          "name" => "Send Due Date Reminder",
          "trigger" => "Task due date is within 24 hours",
          "steps" => [
            "Check tasks approaching deadline",
            "Send notification to assignee"
          ],
          "outcome" => "User receives reminder notification"
        },
        %{
          "name" => "Update Task Metrics",
          "trigger" => "Task status changes",
          "steps" => [
            "Record status change",
            "Update workspace statistics"
          ],
          "outcome" => "Workspace dashboard reflects current state"
        }
      ],
      "architecture_components" => [
        %{
          "component" => "Web Frontend",
          "responsibility" => "User interface and client-side interactions",
          "type" => "frontend",
          "depends_on" => ["API Server"]
        },
        %{
          "component" => "API Server",
          "responsibility" => "Business logic and data access",
          "type" => "backend",
          "depends_on" => ["Database", "Notification Service"]
        },
        %{
          "component" => "Database",
          "responsibility" => "Persistent data storage",
          "type" => "infra",
          "depends_on" => []
        },
        %{
          "component" => "Notification Service",
          "responsibility" => "Email and push notifications",
          "type" => "service",
          "depends_on" => []
        }
      ],
      "architecture_dependencies" => [
        %{
          "source" => "Web Frontend",
          "target" => "API Server",
          "description" => "REST API calls"
        },
        %{
          "source" => "API Server",
          "target" => "Database",
          "description" => "Data persistence"
        },
        %{
          "source" => "API Server",
          "target" => "Notification Service",
          "description" => "Sends notification events"
        }
      ],
      "glossary_terms" => [
        %{
          "term" => "Domain Model",
          "definition" =>
            "The conceptual model of the application's core entities and their relationships"
        },
        %{
          "term" => "User Flow",
          "definition" => "A sequence of steps a user takes to accomplish a goal"
        }
      ],
      "decisions" => [
        %{
          "title" => "REST API for client-server communication",
          "rationale" => "Simple, well-understood pattern suitable for CRUD operations",
          "status" => "accepted"
        },
        %{
          "title" => "PostgreSQL for data storage",
          "rationale" =>
            "Reliable relational database with good support for complex queries",
          "status" => "accepted"
        }
      ]
    }
  end

  @doc """
  Returns realistic mock specs data for testing.
  Models detailed specs for the TodoApp.
  """
  def mock_specs_data do
    %{
      "api" => [
        %{
          "path" => "/api/tasks",
          "method" => "GET",
          "description" => "List all tasks in a workspace",
          "auth" => "token",
          "related_entity" => "Task"
        },
        %{
          "path" => "/api/tasks",
          "method" => "POST",
          "description" => "Create a new task",
          "request_body" => %{
            "title" => "string",
            "description" => "string",
            "priority" => "string"
          },
          "auth" => "token",
          "related_entity" => "Task"
        },
        %{
          "path" => "/api/tasks/:id",
          "method" => "PUT",
          "description" => "Update an existing task",
          "auth" => "token",
          "related_entity" => "Task"
        },
        %{
          "path" => "/api/tasks/:id",
          "method" => "DELETE",
          "description" => "Delete a task",
          "auth" => "token",
          "related_entity" => "Task"
        },
        %{
          "path" => "/api/users",
          "method" => "GET",
          "description" => "List workspace members",
          "auth" => "token",
          "related_entity" => "User"
        }
      ],
      "behaviours" => [
        %{
          "name" => "Create task with valid data",
          "when" => "User submits task form with title",
          "given" => "User is authenticated and in a workspace",
          "then" => "Task is created and appears in task list",
          "actors" => ["User"],
          "side_effects" => ["task.created event emitted"]
        },
        %{
          "name" => "Assign task to user",
          "when" => "User selects assignee on task",
          "given" => "Task exists and assignee is workspace member",
          "then" => "Task assignee is updated and notification sent",
          "actors" => ["User"],
          "side_effects" => ["notification sent to assignee"]
        },
        %{
          "name" => "Complete a task",
          "when" => "User marks task as done",
          "given" => "Task exists and is not already completed",
          "then" => "Task status changes to done",
          "actors" => ["User"],
          "side_effects" => ["task.completed event emitted"]
        }
      ],
      "constraints" => [
        %{
          "name" => "Task requires title",
          "rule" => "Every task must have a non-empty title",
          "applies_to" => ["Task"],
          "enforcement" => "db",
          "severity" => "hard"
        },
        %{
          "name" => "Unique email per user",
          "rule" => "No two users can share the same email address",
          "applies_to" => ["User"],
          "enforcement" => "db",
          "severity" => "hard"
        },
        %{
          "name" => "Due date must be future",
          "rule" => "Task due date must be in the future when set",
          "applies_to" => ["Task"],
          "enforcement" => "app",
          "severity" => "soft"
        }
      ],
      "entities" => [
        %{
          "name" => "users",
          "table" => "users",
          "domain_entity" => "User",
          "columns" => [
            %{"name" => "id", "type" => "uuid", "nullable" => false},
            %{"name" => "email", "type" => "varchar(255)", "nullable" => false},
            %{"name" => "name", "type" => "varchar(255)", "nullable" => false},
            %{
              "name" => "role",
              "type" => "varchar(50)",
              "nullable" => false,
              "default" => "member"
            }
          ],
          "indexes" => [%{"columns" => ["email"], "unique" => true}]
        },
        %{
          "name" => "tasks",
          "table" => "tasks",
          "domain_entity" => "Task",
          "columns" => [
            %{"name" => "id", "type" => "uuid", "nullable" => false},
            %{"name" => "title", "type" => "varchar(255)", "nullable" => false},
            %{"name" => "description", "type" => "text", "nullable" => true},
            %{
              "name" => "status",
              "type" => "varchar(50)",
              "nullable" => false,
              "default" => "todo"
            },
            %{
              "name" => "priority",
              "type" => "varchar(50)",
              "nullable" => false,
              "default" => "medium"
            },
            %{"name" => "due_date", "type" => "timestamp", "nullable" => true},
            %{"name" => "user_id", "type" => "uuid", "nullable" => true},
            %{"name" => "workspace_id", "type" => "uuid", "nullable" => false}
          ],
          "indexes" => [
            %{"columns" => ["workspace_id"]},
            %{"columns" => ["user_id"]}
          ]
        },
        %{
          "name" => "workspaces",
          "table" => "workspaces",
          "domain_entity" => "Workspace",
          "columns" => [
            %{"name" => "id", "type" => "uuid", "nullable" => false},
            %{"name" => "name", "type" => "varchar(255)", "nullable" => false},
            %{"name" => "description", "type" => "text", "nullable" => true}
          ]
        }
      ],
      "modules" => [
        %{
          "name" => "TaskController",
          "path" => "lib/app_web/controllers/task_controller.ex",
          "responsibility" => "Handle HTTP requests for task operations",
          "exports" => ["index", "create", "update", "delete"],
          "arch_component" => "API Server"
        },
        %{
          "name" => "TaskService",
          "path" => "lib/app/tasks/task_service.ex",
          "responsibility" => "Business logic for task operations",
          "exports" => ["list_tasks", "create_task", "update_task", "delete_task"],
          "depends_on" => ["TaskRepo"],
          "arch_component" => "API Server"
        },
        %{
          "name" => "TaskRepo",
          "path" => "lib/app/tasks/task_repo.ex",
          "responsibility" => "Database access for tasks",
          "exports" => ["all", "get", "insert", "update", "delete"],
          "arch_component" => "Database"
        }
      ],
      "events" => [
        %{
          "name" => "task.created",
          "trigger" => "New task is created",
          "payload" => %{
            "task_id" => "uuid",
            "workspace_id" => "uuid",
            "created_by" => "uuid"
          },
          "emitted_by" => "TaskService",
          "consumed_by" => ["NotificationService"]
        },
        %{
          "name" => "task.completed",
          "trigger" => "Task status changed to done",
          "payload" => %{"task_id" => "uuid", "completed_by" => "uuid"},
          "emitted_by" => "TaskService",
          "consumed_by" => ["MetricsService"]
        },
        %{
          "name" => "task.assigned",
          "trigger" => "Task is assigned to a user",
          "payload" => %{"task_id" => "uuid", "assignee_id" => "uuid"},
          "emitted_by" => "TaskService",
          "consumed_by" => ["NotificationService"]
        }
      ],
      "externals" => [
        %{
          "name" => "Email Service",
          "type" => "api",
          "provider" => "SendGrid",
          "purpose" =>
            "Send email notifications for task assignments and reminders",
          "auth_method" => "api_key"
        },
        %{
          "name" => "Push Notification Service",
          "type" => "sdk",
          "provider" => "Firebase",
          "purpose" =>
            "Send push notifications to mobile and web clients",
          "auth_method" => "service_account"
        }
      ],
      "views" => [
        %{
          "name" => "Dashboard",
          "route" => "/dashboard",
          "description" => "Main workspace dashboard showing task overview",
          "components" => ["TaskList", "TaskStats"],
          "data_sources" => ["/api/tasks"]
        },
        %{
          "name" => "Task Detail",
          "route" => "/tasks/:id",
          "description" =>
            "Detailed view of a single task with edit capability",
          "components" => ["TaskForm", "TaskComments"],
          "data_sources" => ["/api/tasks/:id"]
        },
        %{
          "name" => "Settings",
          "route" => "/settings",
          "description" => "Workspace and user settings",
          "components" => ["SettingsForm"],
          "data_sources" => ["/api/users"]
        }
      ],
      "components" => [
        %{
          "name" => "TaskList",
          "description" => "Displays a filterable list of tasks",
          "props" => %{"tasks" => "Task[]", "filter" => "string"},
          "state" => %{"selected_filter" => "string"},
          "events" => ["onTaskClick", "onFilterChange"]
        },
        %{
          "name" => "TaskForm",
          "description" => "Form for creating and editing tasks",
          "props" => %{"task" => "Task?", "onSubmit" => "function"},
          "state" => %{"form_data" => "map"},
          "events" => ["onSubmit", "onCancel"]
        },
        %{
          "name" => "TaskStats",
          "description" => "Shows workspace task statistics",
          "props" => %{"workspace_id" => "string"},
          "state" => %{"stats" => "map"},
          "events" => []
        }
      ],
      "streams" => [
        %{
          "name" => "Task Updates",
          "source" => "TaskService",
          "sink" => "Web Frontend",
          "data_type" => "TaskChange",
          "protocol" => "ws",
          "related_events" => ["task.created", "task.completed"]
        },
        %{
          "name" => "Notification Feed",
          "source" => "NotificationService",
          "sink" => "Web Frontend",
          "data_type" => "Notification",
          "protocol" => "sse"
        }
      ],
      "infra" => [
        %{
          "name" => "App Server",
          "type" => "compute",
          "provider" => "Fly.io",
          "config" => %{"instances" => 2, "region" => "iad"},
          "serves" => ["API Server"]
        },
        %{
          "name" => "PostgreSQL",
          "type" => "storage",
          "provider" => "Fly.io",
          "config" => %{"version" => "15", "size" => "shared-cpu-1x"},
          "serves" => ["Database"]
        },
        %{
          "name" => "Redis Cache",
          "type" => "storage",
          "provider" => "Upstash",
          "config" => %{"eviction" => "volatile-lru"},
          "serves" => ["API Server"]
        }
      ],
      "glossary_terms" => [
        %{
          "term" => "API Endpoint",
          "definition" => "A specific URL path that accepts HTTP requests"
        },
        %{
          "term" => "Behaviour Spec",
          "definition" =>
            "A when/given/then specification of system behaviour"
        }
      ],
      "decisions" => [
        %{
          "title" => "Use WebSockets for real-time task updates",
          "rationale" =>
            "Provides instant feedback when tasks change, better UX than polling",
          "status" => "accepted"
        },
        %{
          "title" => "SendGrid for email delivery",
          "rationale" =>
            "Reliable email API with good deliverability and free tier",
          "status" => "accepted"
        }
      ]
    }
  end

  # -- Private Helpers --

  defp format_problem_data(problem_data) do
    problem_data
    |> Enum.sort_by(fn {k, _} -> k end)
    |> Enum.map(fn {key, value} ->
      "## #{key}\n#{format_value(value)}"
    end)
    |> Enum.join("\n\n")
  end

  defp format_domain_data(domain_data) do
    domain_data
    |> Enum.sort_by(fn {k, _} -> k end)
    |> Enum.map(fn {key, value} ->
      "## #{key}\n#{format_value(value)}"
    end)
    |> Enum.join("\n\n")
  end

  defp format_guiding_questions(questions) do
    questions
    |> Enum.with_index(1)
    |> Enum.map(fn {q, i} -> "#{i}. #{q}" end)
    |> Enum.join("\n")
  end

  defp format_value(value) when is_map(value), do: Bropilot.Yaml.encode(value)
  defp format_value(value) when is_list(value), do: Bropilot.Yaml.encode(value)
  defp format_value(value) when is_binary(value), do: value
  defp format_value(value), do: inspect(value)
end
