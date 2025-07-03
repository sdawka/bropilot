// WorkPlanGenerator.ts
import { v4 as uuidv4 } from 'uuid';
import * as graphlib from 'graphlib';
import type { Module, Thing, Behavior, Flow } from './repositories/index.js';
// --- Types and Interfaces ---

export type Duration = { hours: number };

export interface WorkPlan {
  id: string;
  release_version: string;
  created_at: Date;
  estimated_duration: Duration;
  total_tasks: number;

  methodology: 'test_driven_development' | 'behavior_driven_development';
  qa_mode: 'automated' | 'automated_with_human_checkpoints' | 'manual';
  pr_granularity: 'task_level' | 'story_level' | 'feature_level';

  phases: Phase[];
  tasks: Task[];
  dependencies: Dependency[];
  critical_path: string[];

  checkpoints: Checkpoint[];
  resource_allocation: ResourceAllocation[];
}

export interface Phase {
  name: string;
  description: string;
  duration: string;
  tasks: Task[];
  checkpoint?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  type: 'code_generation' | 'test_generation' | 'validation' | 'documentation';
  implements: {
    entity_type:
      | 'thing'
      | 'behavior'
      | 'flow'
      | 'component'
      | 'contract'
      | 'module';
    entity_id: string;
    entity_name: string;
  };
  estimated_effort: Duration;
  required_skills: string[];
  dependencies: string[];
  artifacts: string[];
  acceptance_criteria: string[];
  assigned_to?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'needs_review';
}

export interface Dependency {
  from: string;
  to: string;
  type: 'explicit' | 'implicit';
}

export interface Checkpoint {
  id: string;
  trigger: string;
  description: string;
  required_artifacts: string[];
}

export interface ResourceAllocation {
  task_id: string;
  assigned_to: string;
  start_time: Date;
  end_time: Date;
}

export interface Release {
  version: string;
  modules: Module[];
  // ...other fields as needed
}

export interface ReleaseChanges {
  modules: {
    added: Module[];
    removed: Module[];
    modified: Module[];
  };
  // ...other change types as needed
}

export interface WorkflowConfiguration {
  methodology: 'test_driven_development' | 'behavior_driven_development';
  qa_mode: 'automated' | 'automated_with_human_checkpoints' | 'manual';
  pr_granularity: 'task_level' | 'story_level' | 'feature_level';
  generate_documentation?: boolean;
  // ...other config fields as needed
}

// --- TaskIdGenerator stub ---
class TaskIdGenerator {
  private count = 0;
  next() {
    this.count += 1;
    return `task-${this.count.toString().padStart(3, '0')}`;
  }
}

// --- WorkPlanGenerator Implementation ---

export class WorkPlanGenerator {
  async generatePlan(
    release: Release,
    previousRelease: Release | null,
    config: WorkflowConfiguration,
  ): Promise<WorkPlan> {
    // Analyze changes
    const changes = previousRelease
      ? await this.analyzeChanges(previousRelease, release)
      : await this.analyzeInitialRelease(release);

    // Generate tasks
    const tasks = await this.generateTasks(changes, config);

    // Build dependency graph
    const dependencies = await this.buildDependencies(tasks);

    // Optimize task order
    const optimizedTasks = await this.optimizePlan(tasks, dependencies);

    // Group into phases
    const phases = await this.groupIntoPhases(optimizedTasks);

    // Add checkpoints
    const checkpoints = await this.generateCheckpoints(phases, config);

    // Calculate critical path
    const criticalPath = await this.calculateCriticalPath(tasks, dependencies);

    // Estimate total duration
    const estimatedDuration = await this.estimateDuration(tasks, config);

    // Allocate resources
    const resourceAllocation = await this.allocateResources(tasks, config);

    return {
      id: uuidv4(),
      release_version: release.version,
      created_at: new Date(),
      estimated_duration: estimatedDuration,
      total_tasks: tasks.length,
      methodology: config.methodology,
      qa_mode: config.qa_mode,
      pr_granularity: config.pr_granularity,
      phases,
      tasks: optimizedTasks,
      dependencies,
      critical_path: criticalPath,
      checkpoints,
      resource_allocation: resourceAllocation,
    };
  }

  // --- Placeholder methods for full implementation ---

  private async analyzeChanges(
    prev: Release,
    curr: Release,
  ): Promise<ReleaseChanges> {
    // TODO: Implement diff logic
    return {
      modules: { added: [], removed: [], modified: [] },
    };
  }

  private async analyzeInitialRelease(
    release: Release,
  ): Promise<ReleaseChanges> {
    // TODO: Implement initial release analysis
    return {
      modules: { added: release.modules, removed: [], modified: [] },
    };
  }

  private async generateTasks(
    changes: ReleaseChanges,
    config: WorkflowConfiguration,
  ): Promise<Task[]> {
    const tasks: Task[] = [];
    const taskIdGenerator = new TaskIdGenerator();

    // Example: Generate tasks for new modules
    for (const module of changes.modules.added) {
      // Module setup task
      tasks.push({
        id: taskIdGenerator.next(),
        title: `Set up ${module.name} module structure`,
        description: `Create directory structure and configuration for ${module.name}`,
        type: 'code_generation',
        implements: {
          entity_type: 'module',
          entity_id: (module as any).id ?? uuidv4(),
          entity_name: module.name,
        },
        estimated_effort: { hours: 1 },
        required_skills: ['architecture'],
        dependencies: [],
        artifacts: [
          `src/modules/${module.name}/index.ts`,
          `src/modules/${module.name}/config.ts`,
        ],
        acceptance_criteria: [
          'Module structure created',
          'Configuration files in place',
          'Module exports defined',
        ],
        status: 'pending',
      });

      // Tasks for Things
      for (const thing of (module as any).things || []) {
        if (config.methodology === 'test_driven_development') {
          // Test first
          const testTask = this.createTestTask(thing, module, taskIdGenerator);
          tasks.push(testTask);

          // Then implementation
          const implTask = this.createImplementationTask(
            thing,
            module,
            taskIdGenerator,
          );
          implTask.dependencies.push(testTask.id);
          tasks.push(implTask);
        } else {
          // Implementation first
          tasks.push(
            this.createImplementationTask(thing, module, taskIdGenerator),
          );
        }
      }

      // Tasks for Behaviors
      for (const behavior of (module as any).behaviors || []) {
        const behaviorTasks = await this.createBehaviorTasks(
          behavior,
          module,
          config,
          taskIdGenerator,
        );
        tasks.push(...behaviorTasks);
      }

      // Tasks for Flows
      for (const flow of (module as any).flows || []) {
        const flowTasks = await this.createFlowTasks(
          flow,
          module,
          taskIdGenerator,
        );
        tasks.push(...flowTasks);
      }
    }

    // TODO: Add logic for modified/removed entities, integration, documentation, etc.

    return tasks;
  }

  private createTestTask(
    thing: Thing,
    module: Module,
    taskIdGenerator: TaskIdGenerator,
  ): Task {
    return {
      id: taskIdGenerator.next(),
      title: `Write tests for ${thing.name}`,
      description: `Write unit and integration tests for ${thing.name}`,
      type: 'test_generation',
      implements: {
        entity_type: 'thing',
        entity_id: (thing as any).id ?? uuidv4(),
        entity_name: thing.name,
      },
      estimated_effort: { hours: 2 },
      required_skills: ['testing', 'backend'],
      dependencies: [],
      artifacts: [`src/modules/${module.name}/entities/${thing.name}.test.ts`],
      acceptance_criteria: [
        'All CRUD operations covered',
        'Edge cases tested',
        'Tests pass',
      ],
      status: 'pending',
    };
  }

  private createImplementationTask(
    thing: Thing,
    module: Module,
    taskIdGenerator: TaskIdGenerator,
  ): Task {
    return {
      id: taskIdGenerator.next(),
      title: `Implement ${thing.name} entity`,
      description: `Create ${thing.name} with schema validation and CRUD operations`,
      type: 'code_generation',
      implements: {
        entity_type: 'thing',
        entity_id: (thing as any).id ?? uuidv4(),
        entity_name: thing.name,
      },
      estimated_effort: { hours: 3 },
      required_skills: ['backend'],
      dependencies: [],
      artifacts: [
        `src/modules/${module.name}/entities/${thing.name}.ts`,
        `src/modules/${module.name}/repositories/${thing.name}.repository.ts`,
      ],
      acceptance_criteria: [
        'Entity class implemented with proper types',
        'Schema validation working',
        'CRUD operations implemented',
        'Repository pattern followed',
      ],
      status: 'pending',
    };
  }

  private async createBehaviorTasks(
    behavior: Behavior,
    module: Module,
    config: WorkflowConfiguration,
    taskIdGenerator: TaskIdGenerator,
  ): Promise<Task[]> {
    // TODO: Implement behavior task generation
    return [];
  }

  private async createFlowTasks(
    flow: Flow,
    module: Module,
    taskIdGenerator: TaskIdGenerator,
  ): Promise<Task[]> {
    // TODO: Implement flow task generation
    return [];
  }

  private async buildDependencies(tasks: Task[]): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // Extract explicit dependencies
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        dependencies.push({
          from: depId,
          to: task.id,
          type: 'explicit',
        });
      }
    }

    // TODO: Infer implicit dependencies (e.g., behaviors depend on things)

    // Validate no circular dependencies
    const g = new graphlib.Graph();
    for (const task of tasks) g.setNode(task.id);
    for (const dep of dependencies) g.setEdge(dep.from, dep.to);
    // @ts-ignore: dynamic import of graphlib/lib/alg for runtime algorithm access
    const alg = await import('graphlib/lib/alg');
    if (!alg.default.isAcyclic(g)) {
      throw new Error('Circular dependencies detected');
    }

    return dependencies;
  }

  private async optimizePlan(
    tasks: Task[],
    dependencies: Dependency[],
  ): Promise<Task[]> {
    // Topological sort for valid execution order
    const g = new graphlib.Graph();
    for (const task of tasks) g.setNode(task.id, task);
    for (const dep of dependencies) g.setEdge(dep.from, dep.to);
    // @ts-ignore: dynamic import of graphlib/lib/alg for runtime algorithm access
    const alg = await import('graphlib/lib/alg');
    const sortedIds = alg.default.topsort(g);
    const sortedTasks = sortedIds
      .map((id: string) => g.node(id))
      .filter(Boolean);

    // TODO: Further optimize for parallelization, resource allocation, etc.
    return sortedTasks as Task[];
  }

  private async groupIntoPhases(tasks: Task[]): Promise<Phase[]> {
    // TODO: Implement phase grouping logic
    return [];
  }

  private async generateCheckpoints(
    phases: Phase[],
    config: WorkflowConfiguration,
  ): Promise<Checkpoint[]> {
    // TODO: Implement checkpoint generation
    return [];
  }

  private calculateCriticalPath(
    tasks: Task[],
    dependencies: Dependency[],
  ): string[] {
    // Build adjacency list
    const graph = new Map<string, Set<string>>();
    const reverseGraph = new Map<string, Set<string>>();

    for (const task of tasks) {
      graph.set(task.id, new Set());
      reverseGraph.set(task.id, new Set());
    }

    for (const dep of dependencies) {
      graph.get(dep.from)?.add(dep.to);
      reverseGraph.get(dep.to)?.add(dep.from);
    }

    // Calculate earliest start times
    const earliestStart = new Map<string, number>();
    const taskDuration = new Map(
      tasks.map((t) => [t.id, t.estimated_effort.hours]),
    );

    // Forward pass
    const visited = new Set<string>();
    const visit = (taskId: string): number => {
      if (visited.has(taskId)) {
        return earliestStart.get(taskId) || 0;
      }

      visited.add(taskId);

      const dependencies = reverseGraph.get(taskId);
      if (!dependencies || dependencies.size === 0) {
        earliestStart.set(taskId, 0);
        return 0;
      }

      let maxStart = 0;
      for (const depId of dependencies) {
        const depEnd = visit(depId) + (taskDuration.get(depId) || 0);
        maxStart = Math.max(maxStart, depEnd);
      }

      earliestStart.set(taskId, maxStart);
      return maxStart;
    };

    // Visit all tasks
    for (const task of tasks) {
      visit(task.id);
    }

    // Find critical path
    const endTasks = tasks.filter((t) => (graph.get(t.id)?.size || 0) === 0);
    let criticalEnd = endTasks[0];
    let maxEnd = 0;

    for (const task of endTasks) {
      const end =
        (earliestStart.get(task.id) || 0) + (taskDuration.get(task.id) || 0);
      if (end > maxEnd) {
        maxEnd = end;
        criticalEnd = task;
      }
    }

    // Backtrack critical path
    const criticalPath: string[] = [];
    let current: Task | undefined = criticalEnd;

    while (current) {
      criticalPath.unshift(current.id);

      // Find critical predecessor
      let criticalPred: Task | undefined = undefined;
      const currentStart = earliestStart.get(current.id) || 0;

      for (const predId of reverseGraph.get(current.id) || []) {
        const predEnd =
          (earliestStart.get(predId) || 0) + (taskDuration.get(predId) || 0);
        if (predEnd === currentStart) {
          criticalPred = tasks.find((t) => t.id === predId);
          break;
        }
      }

      current = criticalPred;
    }

    return criticalPath;
  }

  private async estimateDuration(
    tasks: Task[],
    config: WorkflowConfiguration,
  ): Promise<Duration> {
    // TODO: Use node-schedule or ML model for effort estimation
    const totalHours = tasks.reduce(
      (sum, t) => sum + (t.estimated_effort.hours || 0),
      0,
    );
    return { hours: totalHours };
  }

  private async allocateResources(
    tasks: Task[],
    config: WorkflowConfiguration,
  ): Promise<ResourceAllocation[]> {
    // TODO: Implement resource allocation logic
    return [];
  }
}

// --- Exporters (stubs) ---

export class WorkPlanExporter {
  async exportToJira(workPlan: WorkPlan): Promise<any> {
    // TODO: Implement Jira export logic
    return {};
  }

  async exportToGantt(workPlan: WorkPlan): Promise<any> {
    // TODO: Implement Gantt export logic
    return {};
  }
}
