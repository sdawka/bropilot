# Bropilot Project Structure

This document describes the refactored project structure and organization.

## Overview

The project has been refactored from a single large `index.ts` file into a well-organized, modular structure following separation of concerns principles.

## Directory Structure

```
src/
├── index.ts              # Main CLI entry point
├── cli.ts                # Main CLI class with business logic
├── types.ts              # TypeScript type definitions
├── commands/             # Individual CLI commands
│   ├── init.ts          # Initialize new projects
│   ├── commit.ts        # Git commit functionality
│   ├── chat.ts          # Interactive chat sessions
│   ├── process.ts       # Process chats into features
│   ├── tasks.ts         # Generate tasks from features
│   ├── code.ts          # Generate code from tasks
│   └── status.ts        # Show project status
└── lib/                 # Core library modules
    ├── logger.ts        # Logging utilities
    ├── database.ts      # Database operations
    ├── processor.ts     # AI processing engine
    └── ai-provider.ts   # AI provider implementations
```

## Key Components

### Core Classes

1. **BropilotCLI** (`src/cli.ts`)
   - Main application logic
   - Orchestrates database and processing operations
   - Handles user interactions

2. **BropilotDatabase** (`src/lib/database.ts`)
   - Database abstraction layer
   - CRUD operations for all entities
   - SQLite integration (placeholder implementation included)

3. **ProcessingEngine** (`src/lib/processor.ts`)
   - AI-powered processing workflows
   - Chat-to-features extraction
   - Feature-to-tasks generation
   - Task-to-code generation

4. **AIProvider** (`src/lib/ai-provider.ts`)
   - AI service abstraction
   - OpenAI implementation (with placeholder)
   - Extensible for other AI providers

### Type Definitions (`src/types.ts`)

All TypeScript interfaces for:
- Application, Feature, Task entities
- Chat sessions and messages
- Knowledge graph nodes and edges
- Processing prompts
- Configuration

### Command Modules (`src/commands/`)

Each command is implemented as a separate module:
- Clean separation of concerns
- Easy to test and maintain
- Follows Commander.js patterns

## Database Schema

The project includes a complete SQL schema (`schema.sql`) with:
- Entity tables (applications, features, tasks, etc.)
- Relationship constraints
- Default processing prompts
- Configuration settings

## Benefits of Refactoring

1. **Modularity**: Each component has a single responsibility
2. **Maintainability**: Easier to understand and modify individual parts
3. **Testability**: Components can be tested in isolation
4. **Extensibility**: Easy to add new commands and features
5. **Type Safety**: Strong TypeScript typing throughout
6. **Separation of Concerns**: Database, AI, CLI, and business logic are separate

## Usage

The CLI maintains the same interface but is now backed by a much more organized codebase:

```bash
bro init <app-name>      # Initialize new project
bro chat                 # Start chat session
bro process              # Extract features from chats
bro tasks                # Generate tasks from features
bro code                 # Generate code from tasks
bro status               # Show project status
```

## Next Steps

1. Install `better-sqlite3` dependency for actual database functionality
2. Implement real AI provider integration
3. Add comprehensive testing
4. Add configuration management
5. Implement the knowledge graph features

This refactored structure provides a solid foundation for building out the full Bropilot functionality.
