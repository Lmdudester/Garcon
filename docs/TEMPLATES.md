# Garcon Template Guide

Templates define how Garcon runs game servers. This guide explains the template format in detail with examples for creating your own.

## Table of Contents

- [Overview](#overview)
- [Template File Location](#template-file-location)
- [Complete Template Reference](#complete-template-reference)
- [Field Descriptions](#field-descriptions)
- [Variable Substitution](#variable-substitution)
- [Examples](#examples)
- [Troubleshooting Templates](#troubleshooting-templates)

---

## Overview

A template is a YAML file that tells Garcon:
- Which Docker image to use
- What command to run
- What ports the server uses
- What files must exist in the server folder
- What variables users can configure

When you import a server, you select a template. Garcon uses that template to build the Docker container and run your server.

---

## Template File Location

Templates are stored in `garcon-data/templates/` with a `.yaml` extension:

```
garcon-data/
└── templates/
    ├── minecraft.yaml      # Built-in
    ├── valheim.yaml        # Built-in
    ├── vrising.yaml        # Built-in
    ├── terraria.yaml       # Custom
    └── factorio.yaml       # Custom
```

Garcon loads all `.yaml` files from this directory when it starts. To add a new template, create a new file and restart the backend.

---

## Complete Template Reference

Here's the full template schema with all available fields:

```yaml
# ═══════════════════════════════════════════════════════════════
# REQUIRED FIELDS
# ═══════════════════════════════════════════════════════════════

id: string
# Unique identifier for this template
# Used in server configs to reference this template
# Should be lowercase with hyphens (e.g., "minecraft-java", "valheim-plus")

name: string
# Human-readable name shown in the UI
# Example: "Minecraft Java Edition"

docker:
  baseImage: string
  # Docker image to use (e.g., "eclipse-temurin:21-jre", "ubuntu:22.04")
  # Must be available on Docker Hub or already pulled locally

  mountPath: string
  # Path inside the container where server files are mounted
  # Usually "/server"
  # The server folder from garcon-data/servers/<id>/ is mounted here

execution:
  executable: string
  # Main executable file name
  # Used to validate that the source folder is complete
  # Example: "server.jar", "valheim_server.x86_64"

  command: string
  # The full command to run the server
  # Supports {VARIABLE} substitution (see Variable Substitution section)
  # Example: "java -Xmx{MEMORY} -jar server.jar nogui"


# ═══════════════════════════════════════════════════════════════
# OPTIONAL FIELDS
# ═══════════════════════════════════════════════════════════════

description: string
# Template description shown in the UI
# Helps users understand what this template is for

docker:
  workDir: string
  # Working directory inside the container
  # Defaults to mountPath if not specified
  # Useful when the executable must run from a specific directory

  additionalMounts:
  # Additional volume mounts beyond the main server folder
  # Useful for shared libraries, cache directories, etc.
    - host: string      # Path on host machine
      container: string # Path inside container
      readOnly: boolean # Optional, defaults to false

execution:
  stopCommand: string
  # Custom command to stop the server gracefully
  # If not specified, Docker sends SIGTERM
  # Example: "stop" (for servers that read stdin)

  stopTimeout: number
  # Seconds to wait for graceful shutdown before force-killing
  # Default: 30
  # Increase for servers that save on exit (60+ seconds)

defaultPorts:
# Default port mappings suggested when importing a server
# Users can override these during import
  - container: number   # Port number inside container (1-65535)
    protocol: tcp|udp   # Protocol type, defaults to "tcp"
    description: string # Optional description for UI

variables:
# User-configurable variables for command substitution
# These appear as inputs when importing a server
  - name: string        # Variable name (used as {NAME} in command)
    description: string # Description shown in UI
    defaultValue: string # Default value if user doesn't specify
    required: boolean   # If true, user must provide a value (default: false)

requiredFiles:
# Files that must exist in the source folder during import
# Validation fails if any are missing
  - string              # File path relative to server root
```

---

## Field Descriptions

### id

The unique identifier for this template. Use lowercase letters, numbers, and hyphens.

```yaml
# Good
id: minecraft-java
id: valheim-plus
id: factorio-headless

# Bad - avoid spaces, uppercase, special characters
id: Minecraft Java    # Has space and uppercase
id: vrising.exe       # Has dot
```

### docker.baseImage

The Docker image to use. Common choices:

| Game Type | Recommended Image | Notes |
|-----------|-------------------|-------|
| Java games (Minecraft) | `eclipse-temurin:21-jre` | Lightweight Java runtime |
| Native Linux games | `ubuntu:22.04` | Full Linux environment |
| .NET/Mono games | `mono:latest` | For .exe files on Linux |
| Wine games | `ubuntu:22.04` + install Wine | For Windows .exe files |

### docker.mountPath

Where the server files appear inside the container. The server folder is mounted here:

```
Host: garcon-data/servers/my-server/
         ↓ (mounted as)
Container: /server/
```

Use `/server` unless your game requires a specific path.

### execution.command

The actual command to run. This is passed to `sh -c`, so shell features work:

```yaml
# Simple command
command: java -jar server.jar nogui

# With variables
command: java -Xmx{MEMORY} -Xms{MEMORY} -jar server.jar nogui

# Multiple commands (use && for sequential)
command: export LD_LIBRARY_PATH=. && ./server

# With environment variables
command: TERM=xterm ./server.x86_64
```

### execution.stopTimeout

How long to wait for the server to stop gracefully. Set this based on how long your server takes to save:

| Game | Recommended Timeout |
|------|---------------------|
| Minecraft | 30s (default) |
| Valheim | 30s |
| V Rising | 60s |
| ARK | 120s (large save files) |

### variables

Define variables that users can configure when importing:

```yaml
variables:
  - name: MEMORY
    description: Server memory allocation (e.g., 2G, 4G)
    defaultValue: 2G
    required: false

  - name: SERVER_NAME
    description: Display name for your server
    required: true  # User must provide this
```

### requiredFiles

Files that must exist for a valid server. Use to catch incomplete imports:

```yaml
requiredFiles:
  - server.jar          # Main executable
  - eula.txt            # Required for Minecraft
  - server.properties   # Config file
```

---

## Variable Substitution

Variables let users customize the run command without editing the template.

### How It Works

1. Define variables in the `variables` array
2. Use `{VARIABLE_NAME}` in the command
3. User provides values when importing
4. Garcon replaces placeholders when starting the server

### Example

Template:
```yaml
execution:
  command: java -Xmx{MEMORY} -Xms{MEMORY} -jar server.jar nogui

variables:
  - name: MEMORY
    defaultValue: 2G
```

User imports with `MEMORY=4G`:
```
Actual command: java -Xmx4G -Xms4G -jar server.jar nogui
```

### Best Practices

1. **Use descriptive names**: `MAX_PLAYERS` not `MP`
2. **Provide defaults**: Users can always override
3. **Document in description**: Explain valid values
4. **Quote strings in commands**: `"{SERVER_NAME}"` not `{SERVER_NAME}`

---

## Examples

### Minecraft Java Edition (Basic)

```yaml
id: minecraft
name: Minecraft Java Edition
description: Standard Minecraft Java server
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
    description: Server memory (e.g., 2G, 4G, 8G)
    defaultValue: 2G
requiredFiles:
  - server.jar
```

### Minecraft with Fabric Modloader

```yaml
id: minecraft-fabric
name: Minecraft Fabric
description: Minecraft with Fabric modloader
docker:
  baseImage: eclipse-temurin:21-jre
  mountPath: /server
execution:
  executable: fabric-server-launch.jar
  command: java -Xmx{MEMORY} -Xms{MEMORY} -jar fabric-server-launch.jar nogui
  stopTimeout: 60
defaultPorts:
  - container: 25565
    protocol: tcp
    description: Minecraft server port
variables:
  - name: MEMORY
    description: Server memory allocation
    defaultValue: 4G
requiredFiles:
  - fabric-server-launch.jar
  - server.jar
```

### Terraria (Mono Runtime)

```yaml
id: terraria
name: Terraria Dedicated Server
description: Terraria server using Mono runtime
docker:
  baseImage: mono:latest
  mountPath: /server
  workDir: /server
execution:
  executable: TerrariaServer.exe
  command: mono TerrariaServer.exe -config serverconfig.txt -port {PORT}
  stopTimeout: 30
defaultPorts:
  - container: 7777
    protocol: tcp
    description: Game port
variables:
  - name: PORT
    description: Server port
    defaultValue: "7777"
requiredFiles:
  - TerrariaServer.exe
  - serverconfig.txt
```

### Factorio Headless

```yaml
id: factorio
name: Factorio Headless Server
description: Factorio dedicated server (headless)
docker:
  baseImage: ubuntu:22.04
  mountPath: /server
  workDir: /server/bin/x64
execution:
  executable: bin/x64/factorio
  command: ./factorio --start-server /server/saves/{SAVE_NAME}.zip --server-settings /server/data/server-settings.json
  stopTimeout: 30
defaultPorts:
  - container: 34197
    protocol: udp
    description: Game port
variables:
  - name: SAVE_NAME
    description: Name of the save file (without .zip)
    defaultValue: my-save
    required: true
requiredFiles:
  - bin/x64/factorio
  - data/server-settings.json
```

### Project Zomboid

```yaml
id: project-zomboid
name: Project Zomboid Server
description: Project Zomboid dedicated server
docker:
  baseImage: ubuntu:22.04
  mountPath: /server
execution:
  executable: start-server.sh
  command: ./start-server.sh -servername "{SERVER_NAME}" -adminpassword "{ADMIN_PASS}"
  stopTimeout: 60
defaultPorts:
  - container: 16261
    protocol: udp
    description: Game port
  - container: 16262
    protocol: udp
    description: Direct connection port
variables:
  - name: SERVER_NAME
    description: Server name
    defaultValue: MyZomboidServer
  - name: ADMIN_PASS
    description: Admin password
    required: true
requiredFiles:
  - start-server.sh
  - ProjectZomboid64.json
```

### 7 Days to Die

```yaml
id: 7dtd
name: 7 Days to Die Server
description: 7 Days to Die dedicated server for Linux
docker:
  baseImage: ubuntu:22.04
  mountPath: /server
execution:
  executable: 7DaysToDieServer.x86_64
  command: ./7DaysToDieServer.x86_64 -configfile=serverconfig.xml -quit -batchmode -nographics -dedicated
  stopTimeout: 120
defaultPorts:
  - container: 26900
    protocol: tcp
    description: Game port (TCP)
  - container: 26900
    protocol: udp
    description: Game port (UDP)
  - container: 26901
    protocol: udp
    description: Game port +1
  - container: 26902
    protocol: udp
    description: Game port +2
requiredFiles:
  - 7DaysToDieServer.x86_64
  - serverconfig.xml
```

### ARK: Survival Evolved

```yaml
id: ark
name: ARK Survival Evolved
description: ARK dedicated server
docker:
  baseImage: ubuntu:22.04
  mountPath: /server
  workDir: /server/ShooterGame/Binaries/Linux
execution:
  executable: ShooterGame/Binaries/Linux/ShooterGameServer
  command: ./ShooterGameServer "{MAP}?listen?SessionName={SESSION_NAME}?ServerPassword={PASSWORD}" -server -log
  stopTimeout: 180
defaultPorts:
  - container: 7777
    protocol: udp
    description: Game port
  - container: 7778
    protocol: udp
    description: Query port
  - container: 27015
    protocol: udp
    description: RCON port
variables:
  - name: MAP
    description: Map name (e.g., TheIsland, Ragnarok)
    defaultValue: TheIsland
  - name: SESSION_NAME
    description: Server session name
    defaultValue: My ARK Server
  - name: PASSWORD
    description: Server password (leave empty for public)
    defaultValue: ""
requiredFiles:
  - ShooterGame/Binaries/Linux/ShooterGameServer
```

---

## Troubleshooting Templates

### Template Not Appearing in UI

1. **Check file extension**: Must be `.yaml` (not `.yml`)
2. **Check file location**: Must be in `garcon-data/templates/`
3. **Validate YAML syntax**: Use a YAML validator
4. **Restart backend**: Templates load on startup

### "Required file not found" During Import

The files in `requiredFiles` must exist in your source folder:

```yaml
requiredFiles:
  - server.jar      # Must exist at sourcePath/server.jar
  - config/app.cfg  # Must exist at sourcePath/config/app.cfg
```

Fix: Ensure all required files are present before importing.

### Server Fails to Start

1. **Check Docker image exists**:
   ```bash
   docker pull <baseImage>
   ```

2. **Test command manually**:
   ```bash
   docker run -it --rm -v /path/to/server:/server <baseImage> sh
   # Then try running the command
   ```

3. **Check logs**:
   ```bash
   docker logs garcon-<server-id>
   ```

### Variables Not Being Substituted

- Variable names are case-sensitive: `{MEMORY}` not `{memory}`
- Variable must be defined in `variables` array
- Check for typos in both command and variable name

### Server Dies Immediately

- **Missing dependencies**: The base image may lack required libraries
- **Wrong working directory**: Set `docker.workDir` if needed
- **Permission issues**: Executable may not have execute permission

### Port Conflicts

If you get "port already in use":
- Choose different host ports when importing
- Check what's using the port: `netstat -ano | findstr :<port>`

---

## Testing Your Template

Before deploying a new template:

1. **Pull the Docker image**:
   ```bash
   docker pull your-base-image
   ```

2. **Test the command manually**:
   ```bash
   docker run -it --rm \
     -v /path/to/your/server:/server \
     -w /server \
     your-base-image \
     sh -c "your-command-here"
   ```

3. **Verify the server starts and responds**

4. **Test graceful shutdown** (Ctrl+C)

5. **Create the template file and import a server**

6. **Verify start/stop works through Garcon UI**
