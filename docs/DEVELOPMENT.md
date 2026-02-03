# Garcon Development Guide

This guide covers implementation details, architecture decisions, and how to extend Garcon.
If you are just interested in managing your own locally hosted servers, this is probably not necessary to understand.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Backend Implementation](#backend-implementation)
- [Frontend Implementation](#frontend-implementation)
- [Adding a New API Endpoint](#adding-a-new-api-endpoint)
- [Adding a New Service](#adding-a-new-service)
- [Working with Docker](#working-with-docker)
- [Data Flow Examples](#data-flow-examples)
- [Testing](#testing)
- [Common Patterns](#common-patterns)

---

## Architecture Overview

Garcon uses a monorepo structure with three packages:

```
packages/
├── backend/    # Fastify REST API + WebSocket server
├── frontend/   # React + Vite SPA
└── shared/     # TypeScript types and Zod schemas
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Backend Runtime | Node.js 20+ | Server runtime |
| Backend Framework | Fastify | HTTP server, routing, plugins |
| Real-time | @fastify/websocket | WebSocket support |
| Docker Integration | dockerode | Docker API client |
| Validation | Zod | Schema validation and type inference |
| Frontend Framework | React 18 | UI components |
| Frontend Build | Vite | Development server and bundling |
| Styling | Tailwind CSS | Utility-first CSS |
| UI Components | shadcn/ui (Radix) | Accessible component primitives |

### Data Storage

Garcon uses a **filesystem-based** approach instead of a traditional database:

- **Templates**: YAML files in `garcon-data/templates/`
- **Server configs**: `.garcon.yaml` files in each server folder
- **Backups**: tar.gz archives in `garcon-data/backups/`
- **Runtime state**: Discovered from Docker container status

This design makes the system portable and easy to back up.

---

## Backend Implementation

### Directory Structure

```
packages/backend/src/
├── index.ts              # Application entry point
├── app.ts                # Fastify app setup
├── config/
│   └── index.ts          # Configuration loading
├── routes/
│   ├── server.routes.ts  # /api/servers endpoints
│   ├── template.routes.ts # /api/templates endpoints
│   ├── backup.routes.ts  # Backup endpoints
│   ├── health.routes.ts  # Health check
│   └── websocket.routes.ts # WebSocket handler
├── services/
│   ├── server.service.ts       # Server lifecycle management
│   ├── template.service.ts     # Template loading
│   ├── docker-manager.service.ts # Docker operations
│   ├── backup.service.ts       # Backup creation/management
│   ├── file-manager.service.ts # File I/O operations
│   └── websocket.service.ts    # WebSocket broadcasting
└── errors/
    └── index.ts          # Custom error types
```

### Service Layer Pattern

All business logic lives in service classes. Routes are thin handlers that:
1. Parse and validate request data
2. Call service methods
3. Format and return responses

```typescript
// routes/server.routes.ts
fastify.post('/api/servers/:id/start', async (request, reply) => {
  const { id } = request.params as { id: string };
  await serverService.startServer(id);  // Service handles the logic
  return reply.status(204).send();
});
```

### Core Services

#### ServerService (`server.service.ts`)

Manages server lifecycle and state:

```typescript
class ServerService {
  // In-memory server state
  private servers: Map<string, Server> = new Map();

  // Server operations
  async loadServers(): Promise<void>       // Load from filesystem on startup
  async importServer(data): Promise<Server> // Import new server
  async deleteServer(id): Promise<void>    // Delete server and files
  async startServer(id): Promise<void>     // Start Docker container
  async stopServer(id): Promise<void>      // Stop Docker container
  async restartServer(id): Promise<void>   // Stop then start

  // Update workflow
  async initiateUpdate(id): Promise<void>  // Start update process
  async applyUpdate(id): Promise<void>     // Copy source files
  async cancelUpdate(id): Promise<void>    // Cancel update

  // State management
  async updateServerStatus(id, status): Promise<void>
  async handleContainerExit(serverId): Promise<void>  // Crash detection
}
```

#### DockerManagerService (`docker-manager.service.ts`)

Handles all Docker operations:

```typescript
class DockerManagerService {
  // Container lifecycle
  async createAndStartContainer(server, template): Promise<string>
  async stopContainer(containerId, timeout): Promise<void>
  async removeContainer(containerId): Promise<void>

  // Image management
  async ensureImageExists(image): Promise<void>
  async pullImage(image): Promise<void>

  // Monitoring
  async startEventMonitoring(): Promise<void>  // Listen for container events
  async reconcileContainers(): Promise<void>   // Sync state on startup

  // Helpers
  substituteVariables(command, environment): string
  parseMemoryLimit(memory): number
}
```

#### TemplateService (`template.service.ts`)

Loads and validates templates:

```typescript
class TemplateService {
  private templates: Map<string, Template> = new Map();

  async loadTemplates(): Promise<void>     // Load all templates from disk
  async getTemplate(id): Promise<Template> // Get single template
  async getAllTemplates(): Promise<Template[]>
  async initializeDefaultTemplates(): Promise<void>  // Create defaults if missing
}
```

#### BackupService (`backup.service.ts`)

Manages backup creation, restoration, and retention:

```typescript
class BackupService {
  async createBackup(serverId, type, description?): Promise<BackupInfo>
  async listBackups(serverId): Promise<BackupInfo[]>
  async deleteBackup(serverId, timestamp): Promise<void>
  async restoreBackup(serverId, timestamp): Promise<RestoreBackupResponse>  // Restore from backup
  async enforceRetention(serverId): Promise<void>  // Delete old backups per type
}
```

### Error Handling

Custom error types in `errors/index.ts`:

```typescript
// Thrown when a resource is not found
export class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} '${id}' not found`);
  }
}

// Thrown for invalid operations based on server state
export class ServerStateError extends Error {
  constructor(message: string, currentStatus: ServerStatus) {
    super(message);
    this.currentStatus = currentStatus;
  }
}

// Other error types:
// - ValidationError
// - ConflictError
// - DockerError
// - FileSystemError
```

Fastify's error handler maps these to HTTP status codes:
- `NotFoundError` → 404
- `ValidationError` → 400
- `ServerStateError` → 409
- `DockerError` → 503

---

## Frontend Implementation

### Directory Structure

```
packages/frontend/src/
├── main.tsx              # React entry point
├── App.tsx               # Root component with providers
├── components/
│   ├── ui/               # shadcn/ui base components
│   ├── servers/          # Server-related components
│   │   ├── ServerCard.tsx
│   │   ├── ServerControls.tsx
│   │   ├── ServerStatus.tsx
│   │   ├── ImportServerDialog.tsx
│   │   ├── UpdateWorkflow.tsx
│   │   └── BackupDialog.tsx
│   └── layout/
│       ├── Header.tsx
│       └── MainLayout.tsx
├── context/
│   ├── ServerContext.tsx   # Server state management
│   ├── WebSocketContext.tsx # WebSocket connection
│   └── ToastContext.tsx    # Notifications
├── lib/
│   ├── api.ts              # API client
│   └── utils.ts            # Utility functions
└── pages/
    └── HomePage.tsx
```

### State Management

Garcon uses React Context for global state:

#### ServerContext

Provides server data and operations to all components:

```typescript
interface ServerContextType {
  servers: ServerResponse[];
  templates: TemplateResponse[];
  loading: boolean;
  error: string | null;

  // Operations
  importServer(data: CreateServerRequest): Promise<void>;
  deleteServer(id: string): Promise<void>;
  startServer(id: string): Promise<void>;
  stopServer(id: string): Promise<void>;
  restartServer(id: string): Promise<void>;
  initiateUpdate(id: string): Promise<void>;
  applyUpdate(id: string): Promise<void>;
  cancelUpdate(id: string): Promise<void>;
  acknowledgeCrash(id: string): Promise<void>;
}
```

#### WebSocketContext

Manages WebSocket connection and subscriptions:

```typescript
interface WebSocketContextType {
  connected: boolean;
  subscribe(serverId?: string): void;
  unsubscribe(serverId?: string): void;
  onServerStatus(callback: (data) => void): () => void;
  onServerUpdate(callback: (data) => void): () => void;
}
```

### API Client

Located in `lib/api.ts`, provides typed methods for all API calls:

```typescript
export const api = {
  servers: {
    list: () => get<ServerResponse[]>('/api/servers'),
    get: (id: string) => get<ServerResponse>(`/api/servers/${id}`),
    create: (data: CreateServerRequest) => post<ServerResponse>('/api/servers', data),
    update: (id: string, data: UpdateServerRequest) => patch<ServerResponse>(`/api/servers/${id}`, data),
    delete: (id: string) => del(`/api/servers/${id}`),
    start: (id: string) => post(`/api/servers/${id}/start`),
    stop: (id: string) => post(`/api/servers/${id}/stop`),
    restart: (id: string) => post(`/api/servers/${id}/restart`),
    acknowledgeCrash: (id: string) => post(`/api/servers/${id}/acknowledge-crash`),
    updateWorkflow: {
      initiate: (id: string) => post(`/api/servers/${id}/update/initiate`),
      apply: (id: string) => post(`/api/servers/${id}/update/apply`),
      cancel: (id: string) => post(`/api/servers/${id}/update/cancel`),
    },
  },
  templates: {
    list: () => get<TemplateResponse[]>('/api/templates'),
    get: (id: string) => get<TemplateResponse>(`/api/templates/${id}`),
  },
  backups: {
    list: (serverId: string) => get<BackupInfo[]>(`/api/servers/${serverId}/backups`),
    create: (serverId: string, description?: string) =>
      post<BackupInfo>(`/api/servers/${serverId}/backups`, { description }),
    delete: (serverId: string, timestamp: string) =>
      del(`/api/servers/${serverId}/backups/${timestamp}`),
    restore: (serverId: string, timestamp: string) =>
      post<RestoreBackupResponse>(`/api/servers/${serverId}/backups/${timestamp}/restore`),
  },
  health: {
    check: () => get<{ status: string }>('/api/health'),
  },
};
```

---

## Adding a New API Endpoint

### Step 1: Define Types in Shared Package

Add request/response schemas in `packages/shared/src/types/`:

```typescript
// packages/shared/src/types/server.ts
export const RestartOptionsSchema = z.object({
  delay: z.number().optional().default(0),
});
export type RestartOptions = z.infer<typeof RestartOptionsSchema>;
```

### Step 2: Create Route Handler

Add the route in the appropriate routes file:

```typescript
// packages/backend/src/routes/server.routes.ts
fastify.post<{
  Params: { id: string };
  Body: RestartOptions;
}>('/api/servers/:id/restart', async (request, reply) => {
  const { id } = request.params;
  const options = RestartOptionsSchema.parse(request.body);

  if (options.delay > 0) {
    await new Promise(resolve => setTimeout(resolve, options.delay * 1000));
  }

  await serverService.restartServer(id);
  return reply.status(204).send();
});
```

### Step 3: Add Service Method (if needed)

If new business logic is required, add it to the appropriate service:

```typescript
// packages/backend/src/services/server.service.ts
async restartServer(id: string): Promise<void> {
  await this.stopServer(id);
  await this.startServer(id);
}
```

### Step 4: Update Frontend API Client

Add the new endpoint to the API client:

```typescript
// packages/frontend/src/lib/api.ts
restart: (id: string, options?: RestartOptions) =>
  post(`/api/servers/${id}/restart`, options),
```

### Step 5: Rebuild Shared Package

After modifying shared types:

```bash
pnpm --filter @garcon/shared build
```

---

## Adding a New Service

### Step 1: Create the Service Class

```typescript
// packages/backend/src/services/metrics.service.ts
import Docker from 'dockerode';
import { config } from '../config';

export class MetricsService {
  private docker: Docker;

  constructor() {
    this.docker = new Docker({ socketPath: config.docker.socketPath });
  }

  async getContainerStats(containerId: string): Promise<ContainerStats> {
    const container = this.docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });
    return this.parseStats(stats);
  }

  private parseStats(raw: any): ContainerStats {
    // Parse Docker stats format
    return {
      cpuPercent: this.calculateCpuPercent(raw),
      memoryUsage: raw.memory_stats.usage,
      memoryLimit: raw.memory_stats.limit,
    };
  }
}

export const metricsService = new MetricsService();
```

### Step 2: Initialize in App Startup

If the service needs initialization:

```typescript
// packages/backend/src/app.ts
import { metricsService } from './services/metrics.service';

export async function buildApp(): Promise<FastifyInstance> {
  // ... existing setup

  // Initialize metrics service
  await metricsService.initialize();

  return fastify;
}
```

### Step 3: Use in Routes or Other Services

```typescript
// packages/backend/src/routes/server.routes.ts
import { metricsService } from '../services/metrics.service';

fastify.get('/api/servers/:id/metrics', async (request, reply) => {
  const server = await serverService.getServer(request.params.id);
  if (!server.containerId) {
    return reply.status(400).send({ error: 'Server not running' });
  }
  return metricsService.getContainerStats(server.containerId);
});
```

---

## Working with Docker

### Container Naming Convention

All Garcon-managed containers follow this naming pattern:
```
garcon-{serverId}
```

Example: `garcon-my-minecraft-abc123`

### Container Labels

Containers are tagged with labels for identification:

```typescript
{
  'garcon.managed': 'true',
  'garcon.serverId': serverId,
}
```

### Creating a Container

```typescript
const container = await docker.createContainer({
  name: `garcon-${server.config.id}`,
  Image: template.docker.baseImage,
  Cmd: ['sh', '-c', command],  // Run through shell for variable expansion
  WorkingDir: template.docker.workDir || template.docker.mountPath,
  HostConfig: {
    Binds: [`${serverPath}:${template.docker.mountPath}`],
    PortBindings: portBindings,
    Memory: memoryLimit,
    NanoCpus: cpuLimit * 1e9,
    AutoRemove: false,  // Keep container on crash for debugging
  },
  Labels: {
    'garcon.managed': 'true',
    'garcon.serverId': server.config.id,
  },
});
```

### Event Monitoring

Garcon monitors Docker events to detect crashes:

```typescript
docker.getEvents({
  filters: { label: ['garcon.managed=true'], event: ['die'] }
}, (err, stream) => {
  stream.on('data', (chunk) => {
    const event = JSON.parse(chunk.toString());
    const serverId = event.Actor.Attributes['garcon.serverId'];
    // Handle unexpected exit
    serverService.handleContainerExit(serverId);
  });
});
```

---

## Data Flow Examples

### Importing a Server

```
User clicks "Add Server" in UI
        ↓
ImportServerDialog collects:
  - name, sourcePath, templateId
  - ports, environment variables
        ↓
POST /api/servers with CreateServerRequest
        ↓
Backend ServerService.importServer():
  1. Validate template exists
  2. Validate source folder exists
  3. Validate required files exist
  4. Generate unique server ID
  5. Copy files to garcon-data/servers/{id}/
  6. Create .garcon.yaml config
  7. Add to in-memory server map
  8. Broadcast via WebSocket
        ↓
Frontend receives WebSocket message
        ↓
ServerContext updates state
        ↓
UI re-renders with new server card
```

### Starting a Server

```
User clicks "Start" button
        ↓
ServerContext.startServer(id)
        ↓
POST /api/servers/:id/start
        ↓
Backend ServerService.startServer():
  1. Validate server exists
  2. Validate server is stopped
  3. Load template
  4. Update status to 'starting'
  5. Broadcast status via WebSocket
  6. Call DockerManager.createAndStartContainer()
        ↓
DockerManagerService:
  1. Ensure image exists (pull if needed)
  2. Build command with variable substitution
  3. Create container with config
  4. Start container
  5. Return container ID
        ↓
ServerService:
  1. Update status to 'running'
  2. Store container ID
  3. Set startedAt timestamp
  4. Broadcast status via WebSocket
        ↓
Frontend receives WebSocket message
        ↓
UI updates server card (green status, uptime counter)
```

### Update Workflow

```
Stage 1: Initiate
─────────────────
User clicks "Update Server"
        ↓
POST /api/servers/:id/update/initiate
        ↓
ServerService.initiateUpdate():
  1. Stop server if running
  2. Create "pre-update" backup
  3. Set updateStage to "initiated"
  4. Broadcast status
        ↓
UI shows update workflow panel with:
  - Backup confirmation
  - Source folder path for user to update

Stage 2: User Action (Manual)
─────────────────────────────
User downloads new server version
User copies files to source folder
User clicks "Apply Update"

Stage 3: Apply
──────────────
POST /api/servers/:id/update/apply
        ↓
ServerService.applyUpdate():
  1. Copy source folder to server folder
  2. Set updateStage to "none"
  3. Broadcast status
        ↓
Server ready to start with updated files
```

---

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run backend tests
pnpm --filter @garcon/backend test

# Run with coverage
pnpm --filter @garcon/backend test:coverage
```

### Test Structure

```
packages/backend/src/__tests__/
├── services/
│   ├── server.service.test.ts
│   ├── template.service.test.ts
│   └── backup.service.test.ts
└── routes/
    ├── server.routes.test.ts
    └── template.routes.test.ts
```

### Mocking Docker

For tests that involve Docker, mock the dockerode library:

```typescript
import { vi } from 'vitest';

vi.mock('dockerode', () => ({
  default: vi.fn().mockImplementation(() => ({
    createContainer: vi.fn().mockResolvedValue({
      id: 'mock-container-id',
      start: vi.fn().mockResolvedValue(undefined),
    }),
    getContainer: vi.fn().mockReturnValue({
      stop: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    }),
  })),
}));
```

---

## Common Patterns

### Zod Schema Validation

Always validate input data with Zod:

```typescript
import { CreateServerRequestSchema } from '@garcon/shared';

fastify.post('/api/servers', async (request, reply) => {
  // This throws ZodError if validation fails
  const data = CreateServerRequestSchema.parse(request.body);
  // data is now typed correctly
});
```

### WebSocket Broadcasting

Broadcast updates to all connected clients:

```typescript
// In any service
import { websocketService } from './websocket.service';

// Broadcast status change
websocketService.broadcastServerStatus(serverId, {
  status: 'running',
  startedAt: new Date().toISOString(),
});

// Broadcast server list change
websocketService.broadcastServerUpdate(serverId, 'created');
```

### Error Propagation

Let errors bubble up to the Fastify error handler:

```typescript
// Service throws specific error
async getServer(id: string): Promise<Server> {
  const server = this.servers.get(id);
  if (!server) {
    throw new NotFoundError('Server', id);  // Let this propagate
  }
  return server;
}

// Route doesn't need try/catch
fastify.get('/api/servers/:id', async (request, reply) => {
  const server = await serverService.getServer(request.params.id);
  return server;  // Error handler catches NotFoundError
});
```

### Async Initialization

For services that need async setup:

```typescript
class TemplateService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadTemplates();
    this.initialized = true;
  }

  async getTemplate(id: string): Promise<Template> {
    await this.initialize();  // Ensure initialized
    // ...
  }
}
```

---

## Development Workflow

### Making Changes

1. Start development servers:
   ```bash
   pnpm --filter @garcon/backend dev
   pnpm --filter @garcon/frontend dev
   ```

2. Make changes - both servers support hot reload

3. If you modify shared types:
   ```bash
   pnpm --filter @garcon/shared build
   ```

4. Test your changes

5. Commit with descriptive message

### Code Style

- TypeScript strict mode enabled
- Use async/await over raw Promises
- Prefer named exports over default exports
- Use Zod for runtime validation
- Keep functions small and focused

### Debugging Tips

- Backend logs go to `garcon-data/logs/` and console
- Set `LOG_LEVEL=debug` for verbose output
- Use `docker logs garcon-<server-id>` for game server output
- Browser DevTools Network tab for API debugging
- React DevTools for component state inspection
