// WorkExecutor.ts
import { WorkPlan, Task, Checkpoint } from '../WorkPlanGenerator.js';
import * as winston from 'winston';
import * as fs from 'fs';
import * as path from 'path';

// --- Types and Interfaces ---

export interface ExecutionContext {
  workPlan: WorkPlan;
  currentPhase: string;
  activeTasks: Map<string, TaskExecution>;
  completedTasks: Set<string>;
  failedTasks: Map<string, FailureInfo>;
  paused: boolean;
  checkpointId?: string;
  checkpointUrl?: string;

  agents: AgentPool;
  metrics: ExecutionMetrics;
  logs: ExecutionLogger;
}
export interface TaskExecution {
  task: Task;
  agent: Agent;
  startedAt: Date;
  attempts: number;
  status: 'running' | 'waiting_for_checkpoint' | 'retrying';
  progress: number; // 0-100
  logs: string[];
}

export interface FailureInfo {
  error: Error;
  attempts: number;
  lastAttempt: Date;
}

export interface ExecutionMetrics {
  tasksCompleted: number;
  totalDuration: number;
  // Add more metrics as needed
}

export interface ExecutionLogger {
  log: (level: string, message: string, meta?: any) => void;
}

export interface Agent {
  id: string;
  name: string;
  hasSkills(skills: string[]): boolean;
  executeTask(
    task: Task,
    context: any,
    progressCallback: (progress: number, log?: string) => void,
  ): Promise<TaskResult>;
}

export interface TaskResult {
  createdFiles: string[];
  // Add more result fields as needed
}

export interface ExecutionOptions {
  parallelCapacity: number;
  // Add more options as needed
}

// --- AgentPool ---

export class AgentPool {
  private agents: Map<string, Agent> = new Map();
  private busy: Set<string> = new Set();

  getAvailable(requiredSkills: string[]): Agent[] {
    const available: Agent[] = [];
    for (const [id, agent] of this.agents) {
      if (!this.busy.has(id) && agent.hasSkills(requiredSkills)) {
        available.push(agent);
      }
    }
    return available;
  }

  async waitForAgent(requiredSkills: string[]): Promise<Agent> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const available = this.getAvailable(requiredSkills);
        if (available.length > 0) {
          clearInterval(checkInterval);
          resolve(available[0]);
        }
      }, 1000);
    });
  }

  markBusy(agentId: string): void {
    this.busy.add(agentId);
  }

  markAvailable(agentId: string): void {
    this.busy.delete(agentId);
  }
}

// --- TaskQueue ---

type TaskWithDependents = Task & {
  dependents: number;
  isCriticalPath: boolean;
};

export class TaskQueue {
  private queue: TaskWithDependents[];
  private dependencies: Map<string, Set<string>>;
  private dependentsCount: Map<string, number>;
  private criticalPath: Set<string>;

  constructor(workPlan: WorkPlan) {
    // Mark critical path tasks
    this.criticalPath = new Set(workPlan.critical_path);

    // Count dependents for each task
    this.dependentsCount = new Map();
    for (const dep of workPlan.dependencies) {
      this.dependentsCount.set(
        dep.from,
        (this.dependentsCount.get(dep.from) || 0) + 1,
      );
    }

    // Build dependency map
    this.dependencies = new Map();
    for (const task of workPlan.tasks) {
      this.dependencies.set(task.id, new Set(task.dependencies));
    }

    // Build queue with priority info
    this.queue = workPlan.tasks.map((task) => ({
      ...task,
      dependents: this.dependentsCount.get(task.id) || 0,
      isCriticalPath: this.criticalPath.has(task.id),
    }));

    // Sort queue by priority
    this.queue.sort(this.compareTasks);
  }

  getAvailable(completedTasks: Set<string>): Task[] {
    const available: Task[] = [];
    for (const task of this.queue) {
      // Check if all dependencies are completed
      const taskDeps = this.dependencies.get(task.id) || new Set();
      const depsCompleted = Array.from(taskDeps).every((dep) =>
        completedTasks.has(dep),
      );
      if (depsCompleted) {
        available.push(task);
      }
    }
    return available;
  }

  private compareTasks(a: TaskWithDependents, b: TaskWithDependents): number {
    // 1. Critical path first
    if (a.isCriticalPath !== b.isCriticalPath) {
      return a.isCriticalPath ? -1 : 1;
    }
    // 2. More dependents first
    if (a.dependents !== b.dependents) {
      return b.dependents - a.dependents;
    }
    // 3. Shorter tasks first
    return a.estimated_effort.hours - b.estimated_effort.hours;
  }
}

// --- ProgressReporter ---

export class ProgressReporter {
  private lastUpdate: Date = new Date();

  updateProgress(context: ExecutionContext): void {
    const now = new Date();
    if (now.getTime() - this.lastUpdate.getTime() < 1000) {
      return;
    }
    const total = context.workPlan.total_tasks;
    const completed = context.completedTasks.size;
    const active = context.activeTasks.size;
    const failed = context.failedTasks.size;
    const percentage = Math.round((completed / total) * 100);
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(
      `Progress: ${this.renderProgressBar(percentage)} ${percentage}% ` +
        `(${completed}/${total} tasks, ${active} active, ${failed} failed)`,
    );
    this.lastUpdate = now;
  }

  private renderProgressBar(percentage: number): string {
    const width = 30;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }
}

// --- WorkExecutor Skeleton ---

export class WorkExecutor {
  private context!: ExecutionContext;
  private queue!: TaskQueue;
  private running: boolean = false;
  private stateFile: string = path.resolve(
    process.cwd(),
    '.workexecutor.state.json',
  );
  private pauseRequested: boolean = false;

  async start(workPlan: WorkPlan, options: ExecutionOptions): Promise<void> {
    // Try to load previous state
    if (fs.existsSync(this.stateFile)) {
      this.context = await this.loadContext();
      this.queue = new TaskQueue(this.context.workPlan);
    } else {
      this.queue = new TaskQueue(workPlan);

      // Simple logger using winston
      const logger = winston.createLogger({
        level: 'info',
        transports: [
          new winston.transports.Console(),
          new winston.transports.File({ filename: 'workexecutor.log' }),
        ],
      });

      // Initialize agent pool (stub for now)
      const agents = new AgentPool();

      this.context = {
        workPlan,
        currentPhase: workPlan.phases[0]?.name || '',
        activeTasks: new Map(),
        completedTasks: new Set(),
        failedTasks: new Map(),
        paused: false,
        agents,
        metrics: { tasksCompleted: 0, totalDuration: 0 },
        logs: {
          log: (level, message, meta) =>
            logger.log({ level, message, ...meta }),
        },
      };
    }

    // Set up graceful shutdown and pause
    this.running = true;
    process.on('SIGINT', async () => {
      this.running = false;
      this.context.logs.log('info', 'Graceful shutdown initiated.');
      await this.saveContext();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      this.running = false;
      this.context.logs.log('info', 'Graceful shutdown (SIGTERM) initiated.');
      await this.saveContext();
      process.exit(0);
    });

    // Listen for pause/resume (could be triggered by API or CLI)
    process.on('SIGHUP', async () => {
      this.pauseRequested = true;
      this.context.paused = true;
      this.context.logs.log('info', 'Pause requested (SIGHUP).');
      await this.saveContext();
    });

    this.context.logs.log('info', 'Starting work execution...');
    this.context.logs.log(
      'info',
      `Total tasks: ${this.context.workPlan.total_tasks}`,
    );
    this.context.logs.log(
      'info',
      `Parallel capacity: ${options.parallelCapacity}`,
    );

    // Start execution loop
    await this.executionLoop(options);
  }

  private async executionLoop(options: ExecutionOptions): Promise<void> {
    const progressReporter = new ProgressReporter();

    while (
      this.running &&
      this.context.completedTasks.size < this.context.workPlan.total_tasks
    ) {
      // Pause/resume logic
      if (this.pauseRequested || this.context.paused) {
        this.context.logs.log('info', 'Execution paused. Saving state...');
        await this.saveContext();
        while (this.pauseRequested || this.context.paused) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        this.context.logs.log('info', 'Execution resumed.');
      }

      // Check for checkpoint
      const checkpoint = this.checkForCheckpoint();
      if (checkpoint) {
        this.context.paused = true;
        this.context.checkpointId = checkpoint.id;
        this.context.checkpointUrl = `http://localhost:3000/checkpoints/${checkpoint.id}`;
        this.context.logs.log(
          'info',
          `⏸ Checkpoint reached: ${checkpoint.description}`,
          {
            checkpointId: checkpoint.id,
            url: this.context.checkpointUrl,
          },
        );
        await this.saveContext();
        // Wait for resume (e.g., after human review)
        while (this.context.paused) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        this.context.logs.log(
          'info',
          'Checkpoint review complete. Resuming execution.',
        );
      }

      // Get next available tasks
      const availableTasks = this.queue.getAvailable(
        this.context.completedTasks,
      );

      // Filter out tasks already active or completed
      const tasksToRun = availableTasks.filter(
        (t) =>
          !this.context.activeTasks.has(t.id) &&
          !this.context.completedTasks.has(t.id),
      );

      // Determine how many tasks can be started
      const capacity = options.parallelCapacity - this.context.activeTasks.size;
      const toStart = tasksToRun.slice(0, capacity);

      // Start new tasks
      for (const task of toStart) {
        this.executeTask(task);
      }

      // Update progress
      progressReporter.updateProgress(this.context);

      // Wait for any active task to complete or a short pause
      if (this.context.activeTasks.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      } else {
        // If no active tasks, short pause to avoid CPU spinning
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (
      this.context.completedTasks.size === this.context.workPlan.total_tasks
    ) {
      this.context.logs.log('info', 'Work execution completed successfully!');
      await this.saveContext();
    }
  }

  private async executeTask(task: Task): Promise<void> {
    // Select agent (stub: just pick any available)
    const agent = await this.context.agents.waitForAgent(task.required_skills);

    // Create execution record
    const execution: TaskExecution = {
      task,
      agent,
      startedAt: new Date(),
      attempts: 1,
      status: 'running',
      progress: 0,
      logs: [],
    };

    this.context.activeTasks.set(task.id, execution);

    // Log start
    this.context.logs.log('info', `▶ Starting: ${task.title}`, {
      agent: agent.name,
      estimated: task.estimated_effort.hours,
    });

    // Execute in background
    this.executeInBackground(execution).catch((error) => {
      this.context.logs.log('error', `Task failed: ${task.title}`, { error });
      this.context.failedTasks.set(task.id, {
        error,
        attempts: execution.attempts,
        lastAttempt: new Date(),
      });
      this.context.activeTasks.delete(task.id);
    });
  }

  private async executeInBackground(execution: TaskExecution): Promise<void> {
    const { task, agent } = execution;

    try {
      // Prepare task context (stub: empty for now)
      const taskContext = {};

      // Progress callback
      const progressCallback = (progress: number, log?: string) => {
        execution.progress = progress;
        if (log) execution.logs.push(log);
        // Optionally update progress display here
      };

      // Execute with agent
      const result = await agent.executeTask(
        task,
        taskContext,
        progressCallback,
      );

      // Validate result (stub)
      // await this.validateTaskResult(task, result);

      // Mark as complete
      this.completeTask(task, result);
    } catch (error) {
      // Retry logic
      if (execution.attempts < 3) {
        execution.attempts++;
        execution.status = 'retrying';
        this.context.logs.log(
          'warn',
          `⟳ Retrying: ${task.title} (attempt ${execution.attempts})`,
        );
        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, execution.attempts) * 1000),
        );
        await this.executeInBackground(execution);
      } else {
        throw error;
      }
    }
  }

  private async selectAgent(task: Task): Promise<Agent> {
    // TODO: Select best agent for the task
    throw new Error('Not implemented');
  }

  private async validateTaskResult(
    task: Task,
    result: TaskResult,
  ): Promise<void> {
    // TODO: Validate result based on task type
  }

  private completeTask(task: Task, result: TaskResult): void {
    // Remove from active
    this.context.activeTasks.delete(task.id);

    // Add to completed
    this.context.completedTasks.add(task.id);

    // Update metrics
    this.context.metrics.tasksCompleted++;

    // Log completion
    this.context.logs.log('info', `✓ Completed: ${task.title}`, {
      created: result.createdFiles,
    });

    // Optionally persist state here
  }

  // --- State Persistence ---

  private async saveContext(): Promise<void> {
    try {
      // Serialize Maps/Sets for JSON
      const replacer = (key: string, value: any) => {
        if (value instanceof Map) {
          return { dataType: 'Map', value: Array.from(value.entries()) };
        }
        if (value instanceof Set) {
          return { dataType: 'Set', value: Array.from(value.values()) };
        }
        return value;
      };
      fs.writeFileSync(
        this.stateFile,
        JSON.stringify(this.context, replacer, 2),
      );
      this.context.logs?.log('info', 'Execution state saved.');
    } catch (err) {
      console.error('Failed to save execution state:', err);
    }
  }

  private async loadContext(): Promise<ExecutionContext> {
    try {
      const reviver = (key: string, value: any) => {
        if (value && value.dataType === 'Map') {
          return new Map(value.value);
        }
        if (value && value.dataType === 'Set') {
          return new Set(value.value);
        }
        return value;
      };
      const raw = fs.readFileSync(this.stateFile, 'utf-8');
      const ctx = JSON.parse(raw, reviver);
      // Rehydrate logger and agent pool
      const logger = winston.createLogger({
        level: 'info',
        transports: [
          new winston.transports.Console(),
          new winston.transports.File({ filename: 'workexecutor.log' }),
        ],
      });
      ctx.logs = {
        log: (level: string, message: string, meta?: any) =>
          logger.log({ level, message, ...meta }),
      };
      ctx.agents = new AgentPool();
      return ctx;
    } catch (err) {
      console.error('Failed to load execution state:', err);
      throw err;
    }
  }

  // --- Pause/Resume API ---

  public async pause(): Promise<void> {
    this.pauseRequested = true;
    this.context.paused = true;
    await this.saveContext();
    this.context.logs.log('info', 'Execution paused by API.');
  }

  public async resume(): Promise<void> {
    this.pauseRequested = false;
    this.context.paused = false;
    await this.saveContext();
    this.context.logs.log('info', 'Execution resumed by API.');
  }

  // --- Checkpoint Detection ---

  private checkForCheckpoint(): Checkpoint | null {
    if (
      !this.context.workPlan.checkpoints ||
      this.context.workPlan.checkpoints.length === 0
    ) {
      return null;
    }
    // Find first checkpoint whose required artifacts are all present in completed tasks
    for (const checkpoint of this.context.workPlan.checkpoints) {
      if (this.context.checkpointId === checkpoint.id) {
        // Already at this checkpoint, don't trigger again
        continue;
      }
      const allArtifacts = Array.from(this.context.completedTasks)
        .map((id) => {
          const t = this.context.workPlan.tasks.find((t) => t.id === id);
          return t?.artifacts || [];
        })
        .flat();
      const allPresent = checkpoint.required_artifacts.every((a) =>
        allArtifacts.includes(a),
      );
      if (allPresent) {
        return checkpoint;
      }
    }
    return null;
  }
}
