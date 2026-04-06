// Generated TypeScript type definitions
// Do not edit manually

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  userId: string | null;
  workspaceId: string;
}

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
}
