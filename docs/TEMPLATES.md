# Garcon Template Guide

Templates are trusted YAML files that tell Garcon how to import and run one kind of game server. They describe the execution mode, image or native executable, persistent-data path, fixed environment, default ports, required files, and shutdown behavior.

The selected community image's documentation remains the source of truth for its image name, entrypoint, environment-variable names and valid values, persistent-data directory, and ports.

> A Garcon template is not a general-purpose Docker Compose file. It describes the process Garcon launches and the primary data, environment, and port contract, but it cannot reproduce every Docker or Compose feature.

## 1. Five-minute workflow

1. Choose <code>docker</code> for a community image or <code>native</code> for the Windows process provider.
2. Copy the exact image reference, including a tag or digest, into <code>docker.baseImage</code>. A digest is reproducible; tags such as <code>latest</code> and <code>java21</code> can change.
3. Find the image's persistent-data target and set <code>docker.mountPath</code>. Garcon mounts the imported server directory there.
4. Copy the final, literal image settings into <code>docker.environment</code>. These values are fixed for every server imported from this template.
5. Add one numeric <code>defaultPorts</code> entry for every documented container port and protocol. Do not copy the Compose host port into the template.
6. Omit <code>execution.command</code> first so the image's own <code>ENTRYPOINT</code>, <code>CMD</code>, and <code>WORKDIR</code> run. Add it only when an explicit Docker Cmd override is required.
7. Add <code>requiredFiles</code> only for files or directories that must already exist in the selected import folder.
8. Save a direct <code>.yaml</code> file under <code>GARCON_DATA_DIR/templates</code> (normally <code>garcon-data/templates</code>), restart the backend, import a test folder, and inspect the output.

If two server variants need different fixed environment values, create two templates. A template is shared configuration, not a per-server environment form.

## 2. Discovery and built-in patterns

The backend loads direct <code>.yaml</code> files from the templates folder beneath <code>GARCON_DATA_DIR</code> at startup:

~~~text
garcon-data/
└── templates/
    ├── minecraft.yaml
    ├── valheim.yaml
    ├── vrising.yaml
    └── my-community-game.yaml
~~~

<code>GARCON_DATA_DIR</code> defaults to <code>garcon-data</code>; nested files are ignored. Invalid YAML or schema-invalid files are skipped and logged. IDs must be unique; duplicate IDs are not a safe way to create variants because the loader overwrites the earlier entry. Adding or changing a file requires a backend restart.

The built-in templates are useful patterns, not guarantees about an image's current contract. Compare the Docker V Rising template and native Windows V Rising template with the selected game's current documentation before copying their paths or ports.

## 3. Minimal templates

### Docker pattern (schematic)

This deliberately fake image is not runnable. Use the verified fixtures later in this guide for real images.

~~~yaml
id: community-game
name: Community Game Server
description: Example fixed configuration for a documented community image
executionMode: docker
docker:
  baseImage: ghcr.io/example/game-server:1.2.3
  mountPath: /data
  environment:
    ACCEPT_EULA: "true"
    SERVER_NAME: "Garcon Community Server"
    MAX_PLAYERS: "10"
execution:
  stopTimeout: 30
defaultPorts:
  - container: 27015
    protocol: udp
    description: Game port
requiredFiles: []
~~~

These values are sent exactly as written and are shared by every server created from <code>community-game</code>.

### Native Windows pattern

Native templates use direct process spawning. The executable is resolved relative to the imported server directory, and <code>args</code> is an argument array rather than shell text.

~~~yaml
id: vrising-native-example
name: V Rising Native Windows Example
description: Native Windows process template example
executionMode: native
execution:
  executable: VRisingServer.exe
  args:
    - -persistentDataPath
    - ./save-data
  stopTimeout: 120
  rcon:
    enabled: true
    port: 25575
    password: "CHANGE_ME"
    shutdownCommand: shutdown
defaultPorts:
  - container: 9876
    protocol: udp
    description: Game port
  - container: 9877
    protocol: udp
    description: Query port
requiredFiles:
  - VRisingServer.exe
~~~

Native <code>defaultPorts</code> entries are informational metadata only. They do not publish, forward, or configure the native process's ports. Replace <code>CHANGE_ME</code>, keep credentials out of source control, and rotate them if exposed.

## 4. Supported contract

| Field | Supported behavior |
| --- | --- |
| <code>id</code>, <code>name</code>, <code>description</code> | Template identity and operator-facing text. |
| <code>executionMode</code> | <code>docker</code> (default) or <code>native</code>. |
| <code>docker.baseImage</code> | Required for Docker templates; image Garcon pulls and starts. |
| <code>docker.mountPath</code> | Primary in-container path receiving the imported directory; defaults to <code>/server</code>. |
| <code>docker.environment</code> | Literal string values passed to the Docker container. Names and formats come from image documentation. |
| <code>execution.command</code> | Optional Docker Cmd override, passed as <code>["sh", "-c", configured text]</code> while the image Entrypoint remains in effect. |
| <code>execution.executable</code> | Required for a usable native template; resolved relative to the imported directory. |
| <code>execution.args</code> | Native-only arguments passed directly to the process. |
| <code>execution.stopTimeout</code> | Stop wait duration. For native execution it bounds the graceful RCON path. |
| <code>execution.requiresNonRoot</code> | Docker-only fixed UID/GID <code>1000:1000</code> mode, including the current <code>HOME</code> behavior. |
| <code>execution.rcon</code> | Native-only graceful shutdown configuration; ignored for Docker. |
| <code>defaultPorts</code> | Numeric container-port/protocol metadata used to seed Docker mappings; it does not configure native networking. |
| <code>requiredFiles</code> | Relative files or directories checked before Garcon copies the import folder. |

| Field | Docker | Native |
| --- | --- | --- |
| <code>docker.baseImage</code> | Required and used | Ignored |
| <code>docker.mountPath</code> | Primary bind-mount target | Ignored |
| <code>docker.environment</code> | Fixed container environment | Ignored; process inherits Garcon's host environment |
| <code>execution.command</code> | Optional Docker Cmd override | Ignored |
| <code>execution.executable</code> / <code>execution.args</code> | Ignored | Direct executable and arguments |
| <code>execution.requiresNonRoot</code> | Fixed <code>1000:1000</code> behavior | Ignored |
| <code>execution.rcon</code> | Ignored | Graceful shutdown when enabled |
| <code>defaultPorts</code> | Seeds stored Docker mappings | Display/import metadata only |
| <code>requiredFiles</code> | Checked before import | Checked before import |

## 5. What templates can and cannot control

A template can control the launched image or executable, the primary Docker data path, fixed Docker environment values, an optional Docker Cmd override, native arguments/RCON settings, default port metadata, required-file checks, and the fixed Docker non-root mode.

It cannot control the following:

| Field or feature | Documentation treatment |
| --- | --- |
| Per-server parameters or server-specific environment overrides | Not part of the current committed template contract. Hard-code values in <code>docker.environment</code>, or create separate templates for separate fixed configurations. |
| Garcon brace-variable or <code>${...}</code> command substitution | Not supported. Any <code>$</code> expansion in an explicit Docker command is ordinary shell behavior using the container environment, not a Garcon parameter feature. |
| <code>docker.workDir</code> | Accepted by the schema but not applied by the current Docker provider. Do not rely on it. |
| <code>docker.additionalMounts</code> | Accepted by the schema but not applied by the current Docker provider. Do not rely on it. |
| <code>execution.stopCommand</code> | Accepted by the schema but ignored by both providers. Use supported stop timeout/RCON behavior. |
| The entire <code>docker</code> block in native mode | Ignored, including image, mount path, environment, and Docker-only options. |
| Native fields in Docker mode and Docker fields in native mode | Ignored by the relevant provider. |
| Native port forwarding | <code>defaultPorts</code> is metadata only; it does not configure a firewall, socket, or forwarding rule. |
| Unknown YAML keys | Not an extension point and will not be applied. |
| Compose networks, <code>cap_add</code>, privileged mode, devices, health checks, restart policies, multiple services, Docker secrets/configs, arbitrary host binds, custom entrypoints, host networking, and port ranges | No matching template field. An image depending on one cannot be represented faithfully without a runtime change. |
| Per-template Docker memory/CPU limits | Resource settings are outside template authoring. |
| Arbitrary Docker user/UID/GID settings | Only <code>execution.requiresNonRoot</code>, selecting fixed <code>1000:1000</code>, is available. |

Do not silently drop an unsupported Compose item. Record the consequence and test the image. If it does not work without the feature, choose another image or request a separate runtime change.

## 6. Fixed environment values and secrets

<code>docker.environment</code> is a map of literal, case-sensitive strings:

~~~yaml
docker:
  baseImage: example/game:1.2.3
  mountPath: /data
  environment:
    SERVER_NAME: "Garcon Server"
    MAX_PLAYERS: "10"
    ACCEPT_EULA: "TRUE"
~~~

Garcon does not read Compose <code>env_file</code> files, host environment variables, or unresolved placeholders. This is not resolved by Garcon:

~~~yaml
environment:
  SERVER_NAME: "${SERVER_NAME}"
~~~

Resolve the value yourself and copy the final literal into the template. Garcon has no template secret store. Passwords and tokens in <code>docker.environment</code> or native RCON configuration are plaintext in template YAML and may appear in local backups, source control, or the current raw template detail response. Use <code>CHANGE_ME</code> in examples, replace it locally, do not commit credentials, and rotate exposed credentials.

Image-specific validation still applies. For example, the Valheim image requires <code>SERVER_PASS</code> to be at least five characters. Garcon does not validate image-specific names or values. Use one template per fixed environment variant.

## 7. Docker and Compose translation

A Compose file is not copied line-for-line:

| Image documentation concept | Garcon field | Limitation |
| --- | --- | --- |
| Image name/tag | <code>docker.baseImage</code> | One image per server; pin a tag or digest when reproducibility matters. |
| Persistent volume target | <code>docker.mountPath</code> | The imported directory is mounted there; the host-side path is not copied. |
| <code>environment</code> / <code>-e KEY=value</code> | <code>docker.environment</code> | Fixed literal values; resolve <code>env_file</code> and host placeholders yourself. |
| Service command or image CMD | <code>execution.command</code> | Sets Docker Cmd to <code>sh -c</code> text but does not replace Entrypoint. Omit it when the image default should run. |
| Published container port | <code>defaultPorts[].container</code> and <code>protocol</code> | One numeric entry per port/protocol; the importer chooses host mappings. |
| Required files | <code>requiredFiles</code> | Relative paths checked before import. |

### Worked Compose-to-Garcon conversion

~~~yaml
# Compose source
services:
  minecraft:
    image: itzg/minecraft-server:java21
    environment:
      EULA: "TRUE"
      TYPE: "PAPER"
      VERSION: "1.21.4"
    volumes:
      - ./data:/data
    ports:
      - "25565:25565/tcp"
    # tty, stdin_open, and pull_policy have no Garcon fields.
~~~

~~~yaml
# Garcon translation
id: minecraft-itzg-paper
name: Minecraft Paper (itzg)
description: Fixed Paper configuration based on the itzg community image
executionMode: docker
docker:
  baseImage: itzg/minecraft-server:java21
  mountPath: /data
  environment:
    EULA: "TRUE"
    TYPE: "PAPER"
    VERSION: "1.21.4"
execution: {}
defaultPorts:
  - container: 25565
    protocol: tcp
requiredFiles: []
~~~

The image, environment, volume target, and container port map to template fields. The Compose host path, host port, service name, <code>tty</code>, <code>stdin_open</code>, <code>pull_policy</code>, and other Compose-only settings do not. Garcon pulls a missing image but does not reproduce Compose's update policy. <code>execution.command</code> stays absent so the image's own command runs.

| Compose item | Garcon result | Consequence |
| --- | --- | --- |
| <code>service.image</code> | <code>docker.baseImage</code> | Use the exact tag or digest. |
| <code>service.environment</code> | <code>docker.environment</code> | Values are fixed literals; <code>env_file</code> and host interpolation are not loaded. |
| <code>service.volumes: ./data:/data</code> | <code>docker.mountPath: /data</code> | The imported directory is mounted at <code>/data</code>; <code>./data</code> is not copied. |
| <code>service.ports: 25565:25565/tcp</code> | One <code>defaultPorts</code> entry | The container port/protocol is declared; host mapping is chosen at import. |
| <code>service.command</code> | <code>execution.command</code> only when truly needed | Entrypoint semantics differ; never paste a full <code>docker run</code> or Compose service. |
| <code>service.entrypoint</code> | No Garcon field | The image Entrypoint remains in effect. |
| <code>service.working_dir</code> | No effective field | <code>docker.workDir</code> is ignored; command mode uses <code>docker.mountPath</code>, image-default mode keeps image WORKDIR. |
| <code>service.env_file</code> | No Garcon field | Resolve it and copy final literals into <code>docker.environment</code>. |
| <code>service.user</code> | No arbitrary field | Only fixed <code>execution.requiresNonRoot</code> is available. |
| <code>restart</code>, <code>depends_on</code>, <code>healthcheck</code> | No Garcon field | Garcon does not reproduce Compose orchestration. |
| <code>devices</code>, <code>privileged</code>, <code>cap_add</code>, <code>networks</code>, extra volumes, secrets/configs | No Garcon field | Omit only if the image works without them. |
| Port ranges or <code>network_mode: host</code> | No Garcon field | Use one numeric entry per container port/protocol. |
| <code>tty</code>, <code>stdin_open</code>, <code>pull_policy</code> | No Garcon field | Required behavior cannot be represented. |

### Command and Entrypoint behavior

<code>execution.command</code> is not a complete Docker command or Entrypoint replacement. When set, Garcon creates Docker Cmd as:

~~~text
["sh", "-c", "the configured command text"]
~~~

The image Entrypoint remains in effect. An exec-form Entrypoint receives those arguments; a shell-form Entrypoint runs its own shell command and may ignore Docker Cmd. When the configured text does execute, the image must contain <code>sh</code>. First omit the command and test the image's own <code>ENTRYPOINT</code>, <code>CMD</code>, and <code>WORKDIR</code>.

Native templates use no shell: <code>execution.executable</code> is required, <code>execution.args</code> is an array, and the imported server directory is the fixed working directory. Do not copy a Compose <code>working_dir</code>, <code>env_file</code>, or shell command into a native template.

## 8. Community-image examples

These fixtures were checked against the linked upstream pages on **2026-11-21**. Upstream docs and mutable tags can change. <code>java21</code> and <code>latest</code> are mutable; production operators should resolve and pin a digest when available. Garcon does not discover or validate image environment variables.

### itzg/minecraft-server

Source: [itzg/docker-minecraft-server documentation](https://github.com/itzg/docker-minecraft-server/blob/master/docs/index.md).

Relevant upstream contract:

~~~yaml
image: itzg/minecraft-server:java21
environment:
  EULA: "TRUE"
  TYPE: "PAPER"
  VERSION: "1.21.4"
volumes:
  - ./data:/data
ports:
  - "25565:25565/tcp"
~~~

~~~yaml
# Checked 2026-11-21; java21 is mutable.
id: minecraft-itzg-paper
name: Minecraft Paper (itzg)
description: Fixed Paper configuration based on the itzg community image
executionMode: docker
docker:
  baseImage: itzg/minecraft-server:java21
  mountPath: /data
  environment:
    EULA: "TRUE"
    TYPE: "PAPER"
    VERSION: "1.21.4"
execution: {}
defaultPorts:
  - container: 25565
    protocol: tcp
requiredFiles: []
~~~

| Upstream item | Garcon mapping | Consequence |
| --- | --- | --- |
| Image and EULA/TYPE/VERSION | <code>baseImage</code> and <code>docker.environment</code> | Fixed for every server; update the tag and matching image docs together. |
| <code>/data</code> volume | <code>docker.mountPath: /data</code> | Imported files are mounted at <code>/data</code>; Compose host path is not used. |
| <code>25565/tcp</code> | One <code>defaultPorts</code> entry | Operator chooses the host port. |
| <code>tty</code>, <code>stdin_open</code>, <code>pull_policy</code> | No Garcon field | Interactive flags and Compose update policy are not reproduced; image default command remains in use. |

### lloesche/valheim-server

Source: [lloesche/valheim-server image documentation](https://hub.docker.com/r/lloesche/valheim-server).

Relevant upstream settings (expand any documented port range into individual Garcon entries):

~~~yaml
image: lloesche/valheim-server:latest
environment:
  SERVER_NAME: "Garcon Valheim"
  WORLD_NAME: "Dedicated"
  SERVER_PASS: "CHANGE_ME"
volumes:
  - ./config:/config
ports:
  - "2456:2456/udp"
  - "2457:2457/udp"
~~~

~~~yaml
# Checked 2026-11-21; latest is mutable.
id: valheim-lloesche
name: Valheim (lloesche)
description: Fixed Valheim configuration based on the lloesche community image
executionMode: docker
docker:
  baseImage: lloesche/valheim-server:latest
  mountPath: /config
  environment:
    SERVER_NAME: "Garcon Valheim"
    WORLD_NAME: "Dedicated"
    SERVER_PASS: "CHANGE_ME"
execution:
  stopTimeout: 120
defaultPorts:
  - container: 2456
    protocol: udp
  - container: 2457
    protocol: udp
requiredFiles: []
~~~

<code>SERVER_PASS</code> must be at least five characters. <code>CHANGE_ME</code> is a plaintext local placeholder.

| Upstream item | Garcon mapping | Consequence |
| --- | --- | --- |
| Image and SERVER_NAME/WORLD_NAME/SERVER_PASS | <code>baseImage</code> and <code>docker.environment</code> | Fixed per template; password is local plaintext and must be replaced/rotated. |
| <code>/config</code> volume | <code>docker.mountPath: /config</code> | Imported files are mounted at the image's configuration path. |
| <code>2456/udp</code> and <code>2457/udp</code> | Two <code>defaultPorts</code> entries | Do not use a range; host mappings are selected during import. |
| Optional <code>/opt/valheim</code> binary-cache volume | No Garcon field | Binaries may download or redownload. |
| <code>CAP_SYS_NICE</code> | No Garcon field | Capability is omitted; test the image without it. |
| Image stop timeout | <code>execution.stopTimeout: 120</code> | Garcon stop behavior, not a Compose restart policy. |

### sknnr/vrising-dedicated-server

Source: [sknnr/vrising-server documentation](https://github.com/jsknnr/vrising-server).

The upstream documentation checked for this guide uses <code>/opt/steam/vrising/save-data</code> and UDP ports <code>27015</code> and <code>27016</code>:

~~~yaml
image: sknnr/vrising-dedicated-server:latest
environment:
  SERVER_NAME: "Garcon V Rising"
  SERVER_PASSWORD: "CHANGE_ME"
  GAME_PORT: "27015"
  QUERY_PORT: "27016"
volumes:
  - ./save-data:/opt/steam/vrising/save-data
ports:
  - "27015:27015/udp"
  - "27016:27016/udp"
~~~

~~~yaml
# Checked 2026-11-21; latest is mutable.
id: vrising-sknnr
name: V Rising (sknnr)
description: Fixed V Rising configuration based on the sknnr community image
executionMode: docker
docker:
  baseImage: sknnr/vrising-dedicated-server:latest
  mountPath: /opt/steam/vrising/save-data
  environment:
    SERVER_NAME: "Garcon V Rising"
    SERVER_PASSWORD: "CHANGE_ME"
    GAME_PORT: "27015"
    QUERY_PORT: "27016"
execution: {}
defaultPorts:
  - container: 27015
    protocol: udp
  - container: 27016
    protocol: udp
requiredFiles: []
~~~

The built-in Garcon V Rising template currently uses <code>/opt/steam/vrising</code> and ports <code>9876/9877</code>; do not copy either set blindly. The selected image tag and current upstream documentation must win.

| Upstream item | Garcon mapping | Consequence |
| --- | --- | --- |
| Image and SERVER_NAME/SERVER_PASSWORD/GAME_PORT/QUERY_PORT | <code>baseImage</code> and <code>docker.environment</code> | Fixed per template; replace and rotate <code>CHANGE_ME</code>. |
| <code>/opt/steam/vrising/save-data</code> volume | <code>docker.mountPath</code> | This differs from the current built-in template; verify the selected tag. |
| <code>27015/udp</code> and <code>27016/udp</code> | Two <code>defaultPorts</code> entries | These are container ports; choose host ports during import. |
| Unsupported Compose capability | No Garcon field | Test without it or choose a representable image. |

## 9. Ports, imports, files, and stop behavior

### Port mappings

Each documented container port gets its own numeric <code>defaultPorts</code> entry with the correct protocol. Valheim's <code>2456/udp</code> and <code>2457/udp</code> are two entries, not a range. A Compose host-side port is not copied into the template. Ranges and host networking are unsupported.

Current mapping limitations matter:

- The UI initially uses the container number as the host number.
- If a direct API request omits ports, the API fallback applies the existing container-plus-index behavior.
- Recommend explicit host mappings when deterministic or collision-free ports matter.
- Stored server config retains host, container, protocol, and user-facing status, but not <code>defaultPorts</code> descriptions. API-generated defaults also omit the template's user-facing marker, while the importer sends its own first-port fallback.

Treat <code>description</code> as template metadata, not guaranteed post-import server metadata. Native <code>defaultPorts</code> remains informational.

### Import folders and required files

<code>requiredFiles</code> is relative to the selected import folder:

~~~yaml
requiredFiles:
  - server.jar
  - config/server.properties
~~~

Garcon checks these paths before copying the folder. It does not download game files or inspect the image. In an import request, <code>sourcePath</code> is a folder name under Garcon's configured import directory, not an arbitrary absolute path.

### Non-root execution

For Docker, <code>execution.requiresNonRoot: true</code> requests UID/GID <code>1000:1000</code> and the current <code>HOME</code> behavior. Confirm that the image supports that user and imported files are writable by it. Arbitrary Docker UID/GID selection is unsupported. The flag has no effect on native execution.

### Native Windows and RCON

Native stdout/stderr is written to <code>GARCON_DATA_DIR/logs/&lt;server-id&gt;.log</code>.

On native stop, Garcon attempts RCON only when <code>execution.rcon.enabled</code> is <code>true</code>. Fallbacks are port <code>25575</code>, an empty password, and command <code>shutdown</code>; the connection goes to <code>localhost</code>. If <code>save-data/Settings/ServerHostSettings.json</code> exists and <code>Rcon.Enabled</code> is true, its <code>Port</code> and <code>Password</code> override template fallbacks. Garcon waits up to <code>execution.stopTimeout</code>, then force-kills after a failed or timed-out RCON attempt. Without enabled RCON, it force-kills and uses the provider's fixed post-kill wait. Docker templates do not use this RCON path.

## 10. Troubleshooting

| Symptom | Diagnosis/check | Fix |
| --- | --- | --- |
| Template is missing | Confirm it is a direct <code>.yaml</code> under <code>GARCON_DATA_DIR/templates</code>, the ID is unique, and backend console/container logs contain no schema error. | Correct the file or ID and restart the backend. |
| Container never starts or image pull fails | Check backend stdout/stderr or container logs, Docker availability, and run <code>docker pull</code> with the exact <code>baseImage</code>. | Correct the image reference/tag or Docker access. |
| Image loses data or resets settings | Compare <code>docker.mountPath</code> with the image's documented persistent-data target. | Use the exact path and re-import/copy data as required. |
| Image starts and exits around its command | Compare Entrypoint form and WORKDIR with Garcon's Cmd behavior. Find it with <code>docker ps -a --filter label=garcon.serverId=&lt;server-id&gt;</code> and inspect <code>docker logs &lt;container-name&gt;</code>. | Remove <code>execution.command</code> or provide only the command text the Entrypoint expects; never paste a full <code>docker run</code>. |
| Environment has no effect | Compare spelling/case and format with pinned image docs; check for <code>env_file</code> or host placeholders. | Put the resolved literal under <code>docker.environment</code> and restart. |
| Required-file error | Check the path relative to the selected import folder. | Add the file or remove it from <code>requiredFiles</code> if unnecessary. |
| Permission denied under non-root | Check <code>execution.requiresNonRoot</code>, expected UID, and mounted-file ownership. | Disable only when safe or prepare files for <code>1000:1000</code>. |
| Port conflict/unreachable server | Check each explicit host/container/protocol mapping and Docker logs; do not use ranges or host networking. | Choose an available host port and keep one entry per container port. |
| Native RCON stop fails | Check enabled RCON, fallback/file port and password, and localhost exposure. | Correct the template or <code>ServerHostSettings.json</code>, confirm <code>shutdownCommand</code>, and remember Garcon force-kills after failure/timeout. |

Backend/template-loader messages go to the Garcon process console or Garcon container logs, not necessarily <code>garcon-data/logs</code>. For Docker output, find the actual container, including stopped containers and custom prefixes:

~~~powershell
docker ps -a --filter "label=garcon.serverId=<server-id>" --format "{{.Names}}"
docker logs <container-name>
~~~

Native output is at <code>GARCON_DATA_DIR/logs/&lt;server-id&gt;.log</code>.

## 11. Pre-import checklist

- [ ] Exact image tag or digest and upstream source/date are recorded.
- [ ] <code>docker.mountPath</code> matches the image's persistent-data target.
- [ ] Every <code>docker.environment</code> key has correct case and a resolved literal value.
- [ ] Passwords use placeholders in shared examples and are not committed.
- [ ] There is one numeric <code>defaultPorts</code> entry for each container port/protocol.
- [ ] <code>execution.command</code> is omitted unless its Entrypoint behavior is understood.
- [ ] <code>requiredFiles</code> paths are relative to the import folder and present.
- [ ] Every unsupported Compose item was translated with a supported field or documented with its consequence.
- [ ] Separate templates are used for separate fixed environment variants.
- [ ] The file is direct <code>.yaml</code> under the configured templates directory and the backend will be restarted.
