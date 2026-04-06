// Generated TypeScript type definitions
// Do not edit manually

export interface Task {
  id: string;
  title: string;
  userId: string | null;
  workspaceId: string;
  categoryId: string | null;
}

export interface User {
  id: string;
}

export interface Workspace {
  id: string;
}

export interface Category {
  id: string;
}
