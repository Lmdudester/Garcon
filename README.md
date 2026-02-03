# Garcon - Game Server Manager

Garcon is a locally-hosted web application for managing game servers via Docker. It provides a simple interface to import, start/stop, backup, and update game servers running in isolated Docker containers.

**Note:** This is mostly a pet project for me, but I wanted to do something I'd actually consider using myself. I'm experimenting with practical uses for Claude Code to advance my knowledge in the area.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Creating Templates](#creating-templates)
- [Server Configuration](#server-configuration)
- [API Reference](#api-reference)
- [WebSocket Protocol](#websocket-protocol)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Features

- **Import game servers** from local folders - you provide pre-configured server files
- **Docker isolation** - all servers run in containers for process isolation and resource management
- **Real-time status** - WebSocket-based live updates for server status
- **Template system** - define how different game servers should run
- **Backup management** - manual backups with configurable retention policy
- **3-stage update workflow** - safely update servers with automatic pre-update backups
- **Crash detection** - automatic detection of unexpected server exits
- **Multiple servers** - run any number of servers simultaneously

## Prerequisites

- **Node.js 20+** (for development)
- **pnpm 9+** (package manager)
- **Docker** (must be running for server operations)

## Quick Start

### Development

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Build shared package:
   ```bash
   pnpm --filter @garcon/shared build
   ```

3. Start the development servers:
   ```bash
   # Terminal 1 - Backend (port 3001)
   pnpm --filter @garcon/backend dev

   # Terminal 2 - Frontend (port 3000)
   pnpm --filter @garcon/frontend dev
   ```

4. Open http://localhost:3000 in your browser

### Using Docker Compose (Development)

```bash
docker-compose -f docker-compose.dev.yml up
```

### Production

```bash
docker-compose up -d
```

### Production with Auto-Update

For a containerized deployment that automatically pulls updates from GitHub on each restart:

1. Copy the example compose file:
   ```bash
   cp docker-compose.autoupdate.example.yml docker-compose.autoupdate.yml
   ```

2. Edit `docker-compose.autoupdate.yml` and set `GARCON_HOST_DATA_DIR` to the **absolute path** of your garcon-data folder:
   ```yaml
   # Windows example:
   - GARCON_HOST_DATA_DIR=C:/Users/YourName/path/to/Garcon/garcon-data

   # Linux example:
   - GARCON_HOST_DATA_DIR=/home/yourname/path/to/Garcon/garcon-data
   ```

3. Build and start:
   ```bash
   docker-compose -f docker-compose.autoupdate.yml up -d --build
   ```

4. To update Garcon, simply restart the container:
   ```bash
   docker restart garcon-server
   ```
   The container will pull the latest code from GitHub and rebuild before starting.

**Note:** The `docker-compose.autoupdate.yml` file is gitignored because it contains machine-specific paths.

## How It Works

### Core Workflow

1. **You** download and configure a game server from the official source (Mojang, Iron Gate, etc.)
2. **You** test that the server works locally
3. **You** import the server folder into Garcon, selecting a template
4. **Garcon** copies your files and manages start/stop/backups via Docker

### What Garcon Does vs. What You Do

| Garcon Handles | You Handle |
|----------------|------------|
| Starting/stopping servers in Docker | Downloading server files from official sources |
| Creating and managing backups | Configuring game settings (difficulty, mods, etc.) |
| Monitoring server status | Testing server works before importing |
| Providing the web UI | Managing game updates (downloading new versions) |
| Process isolation via containers | Creating custom templates for new games |

---

## Creating Templates

Templates define how to run a specific game server type. They specify the Docker image, execution command, default ports, and required files.

**For the complete template guide, see [docs/TEMPLATES.md](docs/TEMPLATES.md).**

### Quick Overview

Templates are YAML files stored in `garcon-data/templates/`. Garcon includes three built-in templates:
- **Minecraft Java Edition** (`minecraft.yaml`)
- **Valheim Dedicated Server** (`valheim.yaml`)
- **V Rising Dedicated Server** (`vrising.yaml`)

### Example Template

```yaml
id: minecraft
name: Minecraft Java Edition
description: Minecraft Java Edition server using Eclipse Temurin 21
docker:
  baseImage: eclipse-temurin:21-jre
  mountPath: /server
execution:
  executable: server.jar
  command: java -Xmx{MEMORY} -Xms{MEMORY} -jar server.jar nogui
  stopTimeout: 30
defaultPorts:
  - container: 25565
    protocol: tcp
    description: Minecraft server port
variables:
  - name: MEMORY
    description: Server memory allocation
    defaultValue: 2G
    required: false
requiredFiles:
  - server.jar
```

### Key Concepts

| Field | Purpose |
|-------|---------|
| `docker.baseImage` | Docker image to run the server in |
| `docker.mountPath` | Path inside container where your server files appear |
| `execution.command` | Command to start the server (supports `{VARIABLE}` substitution) |
| `variables` | User-configurable values that get substituted into the command |
| `requiredFiles` | Files that must exist for a valid server import |

For detailed documentation including the complete schema, many game-specific examples, and troubleshooting, see the **[Template Guide](docs/TEMPLATES.md)**.

---

## Server Configuration

When you import a server, Garcon creates a `.garcon.yaml` file in the server's data folder containing instance-specific configuration.

### Server Config Schema

```yaml
id: string              # Unique server ID (auto-generated)
name: string            # Server display name (you provide)
description: string     # Optional server description (max 250 chars)
templateId: string      # Reference to template ID
sourcePath: string      # Original source folder path
createdAt: datetime     # When server was imported
updatedAt: datetime     # When config was last modified
ports:                  # Port mappings
  - host: number        # Port on host machine
    container: number   # Port inside container
    protocol: tcp|udp   # Protocol type
environment:            # Variable values (used in command substitution)
  VARIABLE_NAME: value
memory: string          # Optional memory limit (e.g., "2G")
cpuLimit: number        # Optional CPU limit
updateStage: string     # Current update workflow stage
```

### Example Server Configuration

```yaml
# garcon-data/servers/my-minecraft-abc123/.garcon.yaml
id: my-minecraft-abc123
name: My Minecraft Server
templateId: minecraft
sourcePath: C:\Users\me\Downloads\minecraft-server
createdAt: 2026-02-01T10:00:00.000Z
updatedAt: 2026-02-01T10:00:00.000Z
ports:
  - host: 25565
    container: 25565
    protocol: tcp
environment:
  MEMORY: 4G
updateStage: none
```

---

## API Reference

### Server Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/servers` | List all servers |
| `POST` | `/api/servers` | Import new server |
| `GET` | `/api/servers/:id` | Get server details |
| `PATCH` | `/api/servers/:id` | Update server (name, description) |
| `DELETE` | `/api/servers/:id` | Delete server |
| `POST` | `/api/servers/:id/start` | Start server |
| `POST` | `/api/servers/:id/stop` | Stop server |
| `POST` | `/api/servers/:id/restart` | Restart server |
| `POST` | `/api/servers/:id/acknowledge-crash` | Clear crash/error state |

### Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/templates` | List available templates |
| `GET` | `/api/templates/:id` | Get template details |

### Backups

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/servers/:id/backups` | List server backups |
| `POST` | `/api/servers/:id/backups` | Create manual backup |
| `DELETE` | `/api/servers/:id/backups/:timestamp` | Delete specific backup |
| `POST` | `/api/servers/:id/backups/:timestamp/restore` | Restore server from backup |

### Update Workflow

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/servers/:id/update/initiate` | Start update process (stops server, creates backup) |
| `POST` | `/api/servers/:id/update/apply` | Apply update (copies source files to server) |
| `POST` | `/api/servers/:id/update/cancel` | Cancel update process |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server health check |

### Import Server Request Body

```json
{
  "name": "My Server",
  "description": "Optional description for this server",
  "sourcePath": "/path/to/server/folder",
  "templateId": "minecraft",
  "ports": [
    { "host": 25565, "container": 25565, "protocol": "tcp" }
  ],
  "environment": {
    "MEMORY": "4G"
  },
  "memory": "4G",
  "cpuLimit": 2
}
```

---

## WebSocket Protocol

Connect to `/ws` for real-time updates.

### Client Messages

```json
// Subscribe to server updates
{ "type": "subscribe", "serverId": "server-id" }

// Subscribe to all servers
{ "type": "subscribe" }

// Unsubscribe
{ "type": "unsubscribe", "serverId": "server-id" }

// Keep-alive
{ "type": "ping" }
```

### Server Messages

```json
// Server status changed
{
  "type": "server_status",
  "serverId": "server-id",
  "status": "running",
  "startedAt": "2026-02-01T10:00:00.000Z",
  "updateStage": "none"
}

// Server created/updated/deleted
{
  "type": "server_update",
  "serverId": "server-id",
  "action": "created"
}

// Keep-alive response
{ "type": "pong" }

// Error
{ "type": "error", "message": "Error description", "code": "ERROR_CODE" }
```

### Server Statuses

| Status | Description |
|--------|-------------|
| `stopped` | Server is not running |
| `starting` | Container is being created/started |
| `running` | Server is actively running |
| `stopping` | Server is being stopped |
| `error` | Server crashed unexpectedly (container preserved for debugging) |
| `updating` | Update workflow in progress |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server port |
| `HOST` | `0.0.0.0` | Backend server host |
| `GARCON_DATA_DIR` | `./garcon-data` | Data directory path (inside container) |
| `GARCON_HOST_DATA_DIR` | (same as GARCON_DATA_DIR) | Host path for Docker-in-Docker volume mounts |
| `GARCON_IMPORT_DIR` | `/garcon-import` | Directory for importing server files (inside container) |
| `GARCON_HOST_IMPORT_DIR` | (same as GARCON_IMPORT_DIR) | Host path for import directory (displayed to users in UI) |
| `GARCON_HOST_IMPORT_PATH` | `./garcon-import` | (Docker Compose only) Host path for import folder mount |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `LOG_PRETTY` | `true` | Pretty print logs |
| `MAX_BACKUPS_PER_TYPE` | `5` | Maximum backups to keep per type (manual, auto, pre-update, pre-restore) |
| `AUTO_BACKUP_ON_STOP` | `true` | Create backup when manually stopping |
| `DOCKER_HOST` | (auto-detect) | Docker socket path |

### Data Directory Location

By default, Garcon stores all data in `./garcon-data`. You can change this with the `GARCON_DATA_DIR` environment variable:

```bash
# Linux/macOS
export GARCON_DATA_DIR=/opt/garcon-data

# Windows PowerShell
$env:GARCON_DATA_DIR = "D:\garcon-data"
```

**Tip:** On Windows, avoid placing the data directory inside OneDrive to prevent sync delays and file locking issues.

---

## Project Structure

```
garcon/
├── packages/
│   ├── backend/              # Fastify API server
│   │   ├── src/
│   │   │   ├── routes/       # API route handlers
│   │   │   ├── services/     # Business logic
│   │   │   │   ├── server.service.ts      # Server lifecycle
│   │   │   │   ├── template.service.ts    # Template loading
│   │   │   │   ├── docker-manager.service.ts # Docker operations
│   │   │   │   ├── backup.service.ts      # Backup management
│   │   │   │   └── websocket.service.ts   # Real-time updates
│   │   │   └── config/       # Configuration
│   │   └── package.json
│   ├── frontend/             # React Vite application
│   │   ├── src/
│   │   │   ├── components/   # UI components
│   │   │   ├── context/      # React context providers
│   │   │   └── lib/          # API client, utilities
│   │   └── package.json
│   └── shared/               # Shared types and schemas
│       └── src/types/        # Zod schemas for validation
├── garcon-data/              # Data directory (gitignored)
│   ├── config/               # Application configuration
│   ├── servers/              # Server files + .garcon.yaml configs
│   ├── backups/              # Backup archives (tar.gz)
│   ├── templates/            # Game template YAML files
│   └── logs/                 # Application logs
├── docker-compose.yml        # Production deployment
├── docker-compose.dev.yml    # Development deployment
├── docker-compose.autoupdate.example.yml  # Auto-update deployment template
├── Dockerfile                # Production image
└── Dockerfile.autoupdate     # Auto-update image (clones from GitHub)
```

---

## Troubleshooting

### Docker Connection Issues

**Error:** "Cannot connect to Docker"

- Ensure Docker Desktop is running
- On Linux, ensure your user is in the `docker` group: `sudo usermod -aG docker $USER`
- Check the Docker socket path with `DOCKER_HOST` environment variable

### Port Already in Use

**Error:** "Port 25565 is already in use"

- Check what's using the port: `netstat -ano | findstr :25565` (Windows) or `lsof -i :25565` (Linux/macOS)
- Stop the conflicting process or use a different host port

### Server Won't Start

1. Check that Docker Desktop is running
2. Verify the template's base image exists: `docker pull <baseImage>`
3. Check the server folder contains all required files
4. Review Garcon logs in `garcon-data/logs/`

### Server Shows "Error" Status

When a server crashes, Garcon preserves the container for debugging:

1. Check container logs: `docker logs garcon-<server-id>`
2. Fix the underlying issue
3. Click "Acknowledge Crash" in the UI to clear the error state
4. Start the server again

### Backup Failures

- Ensure sufficient disk space in the data directory
- Check file permissions on `garcon-data/backups/`
- Review logs for specific error messages

### Template Not Loading

- Ensure the file has `.yaml` extension
- Validate YAML syntax (no tabs, proper indentation)
- Check that `id` field is unique across all templates
- Restart the backend to reload templates

### Game Server Crashes Immediately (Docker Auto-Update)

**Error:** "Unable to access jarfile server.jar" or similar file-not-found errors

This typically means `GARCON_HOST_DATA_DIR` is not set correctly:

1. The path must be the **absolute host path** to your garcon-data folder
2. Use forward slashes on Windows (e.g., `C:/Users/...` not `C:\Users\...`)
3. The path must match where Docker can access the files from the host

Example for Windows:
```yaml
- GARCON_HOST_DATA_DIR=C:/Users/YourName/Documents/Garcon/garcon-data
```

### Remote Access Not Working

If the UI loads but hangs or WebSocket won't connect from another machine:

- The WebSocket URL auto-detects from `window.location`, so access via the correct IP/hostname
- Ensure port 3001 is accessible (check firewall settings)
- For Tailscale/VPN access, use the Tailscale IP address

---

## License

MIT
