# Design: template-authoring documentation for new game servers

## Decision

This is a documentation-only change. It will make it straightforward for a Garcon administrator, or an AI helping that administrator, to turn a community Docker image's documented docker run or Compose configuration into a Garcon template.

No runtime, schema, API, importer UI, lifecycle, or migration behavior will change. In particular, Garcon will continue to treat docker.environment as fixed template configuration; per-server parameter forms and command-variable substitution are not part of this proposal.

## Problem

The current template documentation mixes supported behavior with stale or ineffective fields. It does not give a new template author a reliable translation from an image's documentation to Garcon's YAML, and it does not clearly explain which Docker features Garcon cannot express.

The documentation also needs examples that use real, well-known community images and show why the image's environment-variable names, persistent-data path, command, and ports must be copied exactly from the image documentation.

## Goals

- Make docs/TEMPLATES.md the authoritative, beginner-friendly guide for creating a new game-server template.
- Explain the complete supported template contract, organized by Docker and native execution modes.
- Give a clear "can control / cannot control" matrix so authors do not assume Garcon supports arbitrary Compose or Docker options.
- Teach the fixed-environment model: image-specific values belong under docker.environment, are literal values, and apply to every server imported from that template.
- Provide a generic conversion recipe from a community image's Docker example to a Garcon template.
- Include concise, verified examples for well-known images such as itzg/minecraft-server, lloesche/valheim-server, and sknnr/vrising-dedicated-server, with links back to each project's current documentation.
- Explain the built-in templates as concrete patterns, including the Docker V Rising template and the native Windows V Rising template.
- Correct the README and development documentation so they point to the same contract and stop advertising removed or unsupported features.

## Non-goals

- Do not add per-server environment-variable inputs, template parameters, or a template editor.
- Do not change how Garcon parses templates, starts containers, starts native processes, maps ports, or validates imports.
- Do not make currently ignored schema fields effective. Document them as unsupported or ineffective until a separate runtime change is approved.
- Do not change API exposure or add a template metadata API/UI. The current template detail route can return raw template data, so the guide must not claim that docker.environment values or RCON passwords are hidden; it must tell authors to treat template YAML, backups, and API access as sensitive.
- Do not copy entire upstream image variable tables into Garcon. Link to the upstream source of truth and show only the small set needed to demonstrate the translation pattern.
- Do not change any files under garcon-data/templates/ as part of this documentation task.

## Worktree boundary

The current worktree contains pre-existing, uncommitted functional edits related to parameters, Docker mounts, environment merging, and importer behavior. Those edits are not part of this proposal: preserve them, do not expand them, and do not stage them. Because README.md and docs/TEMPLATES.md are also already dirty, implementation must use a clean temporary worktree from the current branch HEAD, or record a binary baseline patch for those two files before editing and review only the newly applied hunks. Do not reset or clean the existing worktree. Verify the final docs patch against that baseline and with git diff --name-only; the only allowed paths for this task are docs/designs/template-customization-guidance.md, docs/TEMPLATES.md, README.md, and docs/DEVELOPMENT.md.

## Audience and teaching model

The guide should assume the reader has an image name and an upstream README or Compose example, but may not know Docker terminology. It should repeatedly use this translation:

| Image documentation concept | Garcon template field | Important limitation |
| --- | --- | --- |
| Image name/tag | docker.baseImage | Garcon runs one image per server. Pin a tag when reproducibility matters. |
| Persistent volume target | docker.mountPath | Garcon mounts the imported server directory there. The path must match the image's documented data path. |
| environment / -e KEY=value | docker.environment | Values are fixed for every server using this template and are passed literally. Resolve env_file and host placeholders yourself; Garcon does not load them. |
| Compose service command or image CMD | execution.command | This sets Docker Cmd to sh -c plus the configured text but does not replace the image Entrypoint; with an image Entrypoint, the entrypoint receives those arguments and may not execute sh. A full docker run command or Compose service does not belong here. Omit it when the image's own ENTRYPOINT/CMD should run. |
| Published container port | defaultPorts[].container and protocol | Add one numeric entry per container port/protocol. The importer chooses editable host mappings; ranges and host networking are unsupported. |
| Files that must already exist | requiredFiles | Paths are relative to the selected import folder and are checked before copying. |

The guide must show that a Compose file is not copied line-for-line. Each field is translated only when Garcon has a matching supported field, and an omitted field must be accompanied by a stated consequence rather than silently dropped.

## Supported template contract

Document the following as supported behavior, with separate Docker/native notes where applicable:

| Field | Supported behavior to document |
| --- | --- |
| id, name, description | Template identity and the text shown to operators. |
| executionMode | docker (the default) or native; native execution is for the Windows process provider. |
| docker.baseImage | Required for Docker templates; the image Garcon pulls/starts. |
| docker.mountPath | The primary in-container path receiving the imported server directory; defaults to /server. |
| docker.environment | A map of literal string values passed into the Docker container. Keys and values must come from the selected image's documentation. Garcon performs no template-variable substitution; an explicit execution.command may still use ordinary shell expansion of these variables. |
| execution.command | Optional Docker Cmd override, passed as sh -c arguments while the image Entrypoint remains in effect. Omitting it preserves the image's own startup command and WORKDIR; when present, the current provider sets docker.mountPath as the working directory and docker.workDir is not applied. It is not a native executable command. |
| execution.executable | Required for a usable native template; the path is resolved relative to the imported server directory. |
| execution.args | Native-only process arguments. |
| execution.stopTimeout | Stop wait duration passed to provider shutdown behavior. For native execution it matters to the RCON graceful-shutdown path; without enabled RCON, native stop force-kills and uses the provider's fixed post-kill wait. |
| execution.requiresNonRoot | Docker-only request to run as UID/GID 1000:1000, with the current HOME behavior; it is ignored for native execution. Explain that the image and mounted files must support this user. |
| execution.rcon | Native-only graceful shutdown configuration; it is ignored for Docker. Explain fallback values, the V Rising ServerHostSettings.json override behavior, and force-kill fallback. |
| defaultPorts | One numeric container port/protocol entry per exposed game port, plus optional description and player-facing metadata. Docker imports use these to seed mappings; native processes do not receive Docker port bindings. |
| requiredFiles | Relative files/directories that must be present in the import folder before Garcon copies it. |

## Explicitly unsupported or misleading fields

The guide must include a prominent table that prevents authors from relying on fields that the current runtime does not honor:

| Field or Docker feature | Documentation treatment |
| --- | --- |
| parameters, per-server environment forms, or server-specific environment overrides | Not part of the current contract. Hard-code the desired values in docker.environment, or create separate templates for different fixed configurations. |
| Garcon-specific brace-variable command substitution | Not supported. Garcon does not replace placeholders in execution.command. If an author explicitly writes shell syntax such as dollar-sign variables in execution.command, any expansion is ordinary sh behavior using the container environment, not a Garcon parameter feature. |
| docker.workDir | Accepted by the schema but not applied by the current Docker provider; do not rely on it. |
| docker.additionalMounts | Accepted by the schema but not applied by the current Docker provider; do not rely on it. |
| execution.stopCommand | Accepted by the current schema but ignored by both providers; use the provider's supported stop timeout/RCON behavior instead. |
| The entire docker block in native mode | Ignored by the native provider, including docker.environment, mountPath, image, and Docker-only options. |
| execution.command or execution.requiresNonRoot in native mode | Ignored by the native provider. |
| execution.executable, execution.args, or execution.rcon in Docker mode | Ignored by the Docker provider. |
| defaultPorts in native mode | Display/import metadata only; it does not configure the native process or forward ports. Current server responses may still display/copy stored native mappings, so the guide must not present them as network configuration. |
| Unknown YAML keys | Not a supported extension point. The schema may discard unknown keys, and the provider will not apply them. |
| Docker Compose networks, cap_add, privileged mode, devices, health checks, restart policies, multiple services, Docker secrets/configs, arbitrary host bind mounts, custom entrypoint settings, host networking, and port ranges | No corresponding supported template field. The guide must say that an image depending on these features cannot be represented faithfully by a template without a separate Garcon runtime change. |
| Per-template Docker memory/CPU limits | Not template fields. Explain separately that server resource settings, where available, are outside template authoring. |
| Arbitrary Docker user/UID/GID settings | Not supported. The only template-controlled non-root behavior is the fixed 1000:1000 mode exposed by execution.requiresNonRoot. |

This section should use a callout: a template can configure the process Garcon launches and the primary data/port/environment contract, but it is not a general-purpose Docker Compose file.

### Literal environment values and secrets

The guide must explicitly explain that Garcon does not read Compose env_file files, host environment variables, or unresolved Compose placeholders. An author must copy the final literal value into docker.environment, for example SERVER_NAME: "Garcon Server", rather than copying SERVER_NAME: "${SERVER_NAME}" and expecting Garcon to resolve it.

Garcon has no template secret store. Passwords and tokens placed in docker.environment or native RCON configuration are plaintext in the template YAML and may be included in local backups, source control, or the current raw template detail response. Examples must use placeholders such as CHANGE_ME, explain that the operator must replace and rotate them, and warn against committing credentials. The guide must call out image-specific validation, including Valheim's requirement that SERVER_PASS be at least five characters.

### Ports and current mapping limitations

The guide must distinguish container ports from host ports. Each image-documented container port gets its own numeric defaultPorts entry with the correct protocol; for example, Valheim's 2456/udp and 2457/udp are two entries, not a range. The host side of a Compose mapping is not copied into the template. Garcon's importer lets an operator edit host mappings, while ranges and host networking cannot be represented.

The guide must document the current implementation limitation rather than imply deterministic ideal behavior: the UI initially uses the container number as the host number, while the direct API fallback for omitted ports applies the existing container-plus-index behavior. Authors should recommend explicit host mappings when deterministic or collision-free ports matter. Native defaultPorts entries are informational and do not configure the native process or create network forwarding.

The guide must also state what survives import: the current server-config/request shape stores host, container, protocol, and user-facing status, but not defaultPorts descriptions; API-generated defaults also omit the template's user-facing marker, while the importer sends its own first-port fallback. Descriptions should therefore be presented as template documentation metadata, not as guaranteed post-import server metadata.

### Command and entrypoint caveat

The guide must show that execution.command is not a complete Docker command or entrypoint replacement. Garcon sets Docker Cmd to [sh, -c, configured text] and leaves the image Entrypoint in place; an exec-form Entrypoint receives those arguments, while a shell-form Entrypoint runs its own shell command and ignores Docker Cmd, so Garcon's injected sh -c text is not executed. When the configured text does execute, the image must contain sh. Copying a Compose command can therefore produce different behavior. Authors should first omit execution.command and test the image's own ENTRYPOINT/CMD and WORKDIR, then add a command only when the image documentation requires an override.

Native templates use direct process spawning, not a shell: execution.executable is required, execution.args are passed as an argument array, and the imported server directory is the fixed working directory. The schema may contain a docker block or docker.environment on a native template, but the native provider ignores it; the process instead inherits Garcon's host process environment. Do not copy a Compose working_dir, env_file, or shell command into a native template and expect it to work.

## Documentation changes

### docs/TEMPLATES.md

Rewrite the guide around this structure:

1. What a Garcon template is and the Docker/native decision.
2. The five-minute workflow: find an image, copy its image/tag, identify its persistent-data target, copy literal environment values, declare ports, decide whether to keep the image command, add required files, save/restart/test.
3. A complete minimal Docker template and a complete minimal native template.
4. The supported field reference and execution-mode matrix.
5. The can-control / cannot-control matrix above.
6. How docker.environment works, including fixed values, case sensitivity, quoting, secrets in local YAML, and why two fixed setups should use two templates.
7. How to translate a community docker run or Compose example without copying unsupported fields.
8. Community-image examples.
9. Ports, import folders, required files, image-default commands, non-root execution, stop behavior, native Windows/RCON behavior, and common failure modes.
10. A pre-import checklist and a symptom-to-diagnosis-to-fix troubleshooting table. Require entries for a skipped/invalid template (including where backend logs appear), image-pull failure, wrong data mount, wrong command/Entrypoint interaction, ineffective environment values, missing required files, non-root permission failures, host-port conflicts, and native RCON failure/timeout, with the exact log location or Docker command to inspect.

The guide must also explain discovery and identity: only direct .yaml files under the configured data directory's templates folder are loaded at backend startup (`GARCON_DATA_DIR` controls the data directory; the default is garcon-data); nested files are ignored. Invalid files are skipped and logged; template ids must be unique; and duplicate ids are not a safe way to create variants because the loader overwrites the earlier entry. Adding or changing a file requires a backend restart.

Require a concrete troubleshooting table with entries in this form:

| Symptom | Diagnosis/check | Fix |
| --- | --- | --- |
| Template is missing from the selector | Confirm the file is a direct .yaml file under GARCON_DATA_DIR/templates, the id is unique, and the backend process console/container logs contain no schema error. | Correct the file/id and restart the backend. |
| Container never starts or image pull fails | Check Garcon's backend stdout/stderr or container logs and Docker availability; run docker pull with the exact baseImage outside Garcon. | Correct the image reference/tag or Docker access, then restart the server. |
| Image starts but loses data or resets settings | Compare docker.mountPath with the image's documented persistent-data target. | Use the exact container path and re-import/copy data as the image expects. |
| Image starts and exits around its command | Compare the image's exec-form/shell-form Entrypoint and WORKDIR with Garcon's Cmd behavior; find the container name with docker ps -a --filter label=garcon.serverId=<server-id> and then inspect it with docker logs <container-name>. | Remove execution.command to keep the image default, or provide only the command text the image's Entrypoint expects; do not paste a full docker run command. |
| Environment setting has no effect | Compare key spelling/case and value format with the pinned image documentation; check for an unresolved env_file or host placeholder. | Put the resolved literal value under docker.environment and restart the server. |
| Required file error | Check the path relative to the selected import folder. | Place the file in the import folder or remove it from requiredFiles if the image does not need it. |
| Permission denied under a non-root image | Check execution.requiresNonRoot, the image's expected UID, and mounted-file ownership. | Disable the flag only when safe, or prepare files for UID/GID 1000:1000; arbitrary user IDs are unsupported. |
| Port conflict or unreachable server | Check each explicit host/container/protocol mapping and Docker/container logs; do not encode a range or host-network mode. | Choose an available host port and keep one defaultPorts entry per container port. |
| Native RCON stop fails | Check that execution.rcon.enabled is true, the fallback/file-based port and password are correct, and the game exposes RCON on localhost. | Correct the template or ServerHostSettings.json and confirm execution.rcon.shutdownCommand (or its shutdown fallback); Garcon eventually force-kills after failure/timeout. |

The final troubleshooting section must distinguish the log sources: backend/template-loader messages go to the Garcon process console or the Garcon container's logs; Docker game output is inspected by finding the container with docker ps -a --filter label=garcon.serverId=<server-id> and passing its returned name to docker logs, so stopped containers and custom container prefixes work; native stdout/stderr is written to GARCON_DATA_DIR/logs/<server-id>.log. It must not claim that Garcon writes backend logs to garcon-data/logs.

The generic example should make the fixed-environment model obvious. It is explicitly schematic and not runnable: ghcr.io/example/game-server:1.2.3 and its environment keys are placeholders, not a real image. The final guide must label it as a pattern and direct readers to the verified image-specific fixtures below for copyable templates.

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

The guide must explain that those values are sent to the container exactly as written and are shared by all servers created from community-game.

The native example must be complete as well. Its defaultPorts entries are informational metadata only: they do not publish, forward, or configure the native process's listening ports.

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

### Worked Compose-to-Garcon conversion

Include one before/after example so an AI does not put the entire Docker command into execution.command:

    Compose source:
      image: itzg/minecraft-server:java21
      environment:
        EULA: "TRUE"
        TYPE: "PAPER"
        VERSION: "1.21.4"
      volumes:
        - ./data:/data
      ports:
        - "25565:25565/tcp"
      # Upstream also shows tty, stdin_open, and pull_policy; Garcon has no
      # corresponding template fields, so the guide must explain the omission.

    Garcon translation:
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
      defaultPorts:
        - container: 25565
          protocol: tcp
      execution: {}
      requiredFiles: []

Explain that the image, environment, volume target, and container port map to template fields; the Compose host path, host port, service name, tty, stdin_open, pull_policy, and other Compose-only settings do not. Garcon pulls an image when it is missing but does not provide Compose's update policy; if an image requires an omitted capability, it cannot be represented faithfully. execution.command remains absent because this image's own command should run.

The conversion section must include this explicit mapping table:

| Compose item | Garcon result | Consequence when omitted or changed |
| --- | --- | --- |
| service.image | docker.baseImage | Garcon starts the selected image; use the exact tag/digest. |
| service.environment | docker.environment | Values become fixed literal container environment; env_file and host interpolation are not loaded. |
| service.volumes ./data:/data | docker.mountPath: /data | Garcon's imported server directory is mounted at /data; the host-side ./data path is not copied. |
| service.ports 25565:25565/tcp | defaultPorts entry 25565/tcp | The container port/protocol is declared; the importer/API chooses the host mapping. |
| service.command | execution.command only when an explicit Cmd override is truly needed | Entrypoint semantics differ; omit it first and test the image default. Never paste docker run or the entire Compose service here. |
| service.entrypoint | No Garcon field | The image Entrypoint remains in effect; shell-form and exec-form behavior must be tested. |
| service.working_dir | No effective Garcon field | docker.workDir is currently ignored; command mode uses docker.mountPath, while image-default mode keeps the image WORKDIR. |
| service.env_file | No Garcon field | Resolve the file yourself and copy final literal values into docker.environment; host interpolation is not performed. |
| service.user | No arbitrary Garcon field | Only execution.requiresNonRoot, which selects fixed 1000:1000, is available. |
| service.restart, depends_on, healthcheck | No Garcon field | Garcon manages one server process/container and does not reproduce Compose orchestration. |
| service.devices, privileged, cap_add, networks, extra volumes, secrets/configs | No Garcon field | Omit only when the image works without them; otherwise the image is not representable by a template. |
| port ranges or network_mode: host | No Garcon field | Write one numeric defaultPorts entry per container port/protocol; choose host mappings during import. |
| tty, stdin_open, pull_policy, cap_add, extra volumes, networks, healthchecks | No Garcon field | The behavior is not available; an image that requires it cannot be represented faithfully. |

### Community-image examples

Use short, maintainable examples rather than duplicating upstream documentation. Each example should include one internally consistent, copyable configuration: an explicit image tag or digest, an immutable upstream commit permalink where available (or a clearly dated mutable upstream page when the project does not provide one), the source Docker/Compose fragment, a field-by-field mapped/omitted table, the image reference, persistent-data target, two or three environment values, separate numeric container-port entries, the matching Garcon snippet, and one image-specific caveat. If the project offers no stable release digest/tag suitable for documentation, use the selected mutable tag with an explicit verification date and say that a production operator should resolve and pin the digest independently. Do not leave the reader with vague alternatives such as TYPE/VERSION choices; choose a concrete documented value and label alternatives separately. The mapped/omitted table must explain the consequence of every omitted image option so an AI cannot silently discard a required capability.

- itzg/minecraft-server: show EULA and one concrete documented TYPE/VERSION choice, /data, and TCP 25565; emphasize that the image's environment contract comes from its own README and that a pinned image tag must be paired with the matching variable documentation.
- lloesche/valheim-server: show SERVER_NAME, WORLD_NAME, SERVER_PASS, /config, and two separate entries for 2456/udp and 2457/udp; explicitly explain that SERVER_PASS must be at least five characters and that the upstream image also documents an optional /opt/valheim volume and CAP_SYS_NICE, neither of which Garcon can represent, so the server binaries may be downloaded again and the capability is intentionally omitted.
- sknnr/vrising-dedicated-server: show SERVER_NAME, SERVER_PASSWORD, GAME_PORT, QUERY_PORT, the persistent save-data target, and two separate image-documented UDP entries. Pin and date the example: current upstream documentation uses /opt/steam/vrising/save-data and UDP 27015/27016, while the built-in Garcon template currently uses /opt/steam/vrising and 9876/9877; the guide must call out that discrepancy and tell authors to verify the selected tag rather than copying either set blindly.

Require an explicit per-image mapping table beside each snippet. At minimum, the tables must have these rows:

| Image | Upstream item | Garcon mapping | Omission/consequence |
| --- | --- | --- | --- |
| itzg/minecraft-server | image, EULA/TYPE/VERSION, /data volume, 25565/tcp, tty/stdin_open/pull_policy | baseImage, docker.environment, mountPath, one defaultPorts entry | Compose host path, interactive flags, and pull policy are not reproduced; the image default command remains in use. |
| lloesche/valheim-server | image, SERVER_NAME/WORLD_NAME/SERVER_PASS, /config volume, optional /opt/valheim volume, CAP_SYS_NICE, 2456/udp, 2457/udp, stop timeout | baseImage, docker.environment, mountPath, two defaultPorts entries, execution.stopTimeout | The optional binary-cache volume and capability are unavailable; binaries may redownload and the capability is omitted. |
| sknnr/vrising-dedicated-server | image, SERVER_NAME/SERVER_PASSWORD/GAME_PORT/QUERY_PORT, save-data volume, 27015/udp, 27016/udp | baseImage, docker.environment, mountPath, two defaultPorts entries | The selected tag's data path and ports must win over stale built-in-template values; unsupported Compose options are listed explicitly. |

The initial documentation fixtures should be concrete and valid Garcon YAML rather than pseudo-YAML (upstream pages checked 2026-11-21; tags below are mutable and should be replaced with a digest when one is selected):

    # Verified against the upstream page on 2026-11-21; java21 is a mutable tag.
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

    # Verified against the upstream page on 2026-11-21; latest is a mutable tag.
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

    # Verified against the upstream page on 2026-11-21; latest is a mutable tag.
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

Each fixture must be labeled with its mutable-tag/digest status, source page and verification date; CHANGE_ME must be labeled as plaintext local configuration that needs replacement/rotation. If the selected image tag or upstream documentation changes, update the fixture rather than silently carrying stale values.

Link examples to the projects' primary documentation:

- https://github.com/itzg/docker-minecraft-server/blob/master/docs/index.md
- https://hub.docker.com/r/lloesche/valheim-server
- https://github.com/jsknnr/vrising-server

The examples must include an "upstream docs can change" note and must not imply that Garcon automatically discovers or validates an image's environment variables. Record the exact image tag or digest, the upstream source revision/permalink or dated source page, and the verification date beside each snippet. Explain that a tag such as latest or java21 is mutable, while a digest is immutable; production templates should prefer a digest when the registry makes one available, but the documentation must not pretend a mutable tag is reproducible.

### README.md

Keep the README concise and link to docs/TEMPLATES.md as the source of truth. Correct the quick example so it uses the actual current contract, remove references to variables or command substitution, and explain that:

- templates live in garcon-data/templates/;
- docker.environment contains fixed values for the selected image;
- a new template requires a backend restart;
- sourcePath in an import request is a folder name under Garcon's import directory, not an arbitrary absolute path;
- the full field reference and community-image examples are in the guide.

Remove the existing server-config and import-request environment blocks rather than merely avoiding new examples; they describe the earlier unimplemented per-server environment idea and would contradict the fixed-template model.

### docs/DEVELOPMENT.md

Correct only the implementation descriptions that conflict with the current runtime. Remove stale substituteVariables, variables, brace-variable, and unconditional WorkingDir examples. Describe the actual provider split: fixed Docker environment values, optional Docker Cmd override versus image-default command, the image Entrypoint remaining in effect, native executable/args, required-file checks, current UI/API port-default behavior, and native RCON shutdown behavior.

The RCON section must be exact: on native stop, Garcon attempts RCON only when execution.rcon.enabled is true. The fallback port is 25575, the fallback password is empty, and the fallback shutdown command is shutdown unless the template supplies alternatives; the connection is sent to localhost. When save-data/Settings/ServerHostSettings.json exists and Rcon.Enabled is true, its Port and Password override the template fallbacks. Garcon waits up to the configured stop timeout for a graceful exit, then force-kills after a failed or timed-out RCON attempt; without enabled RCON, it force-kills and uses the provider's fixed post-kill wait. Docker templates do not use this RCON path.

## Verification plan

- Compare every documented field against packages/shared/src/types/template.ts and the provider implementations before finalizing the text.
- Search documentation for stale or prohibited claims: variables, substituteVariables, brace-variable, dollar-brace-variable, per-server parameters, promises that workDir/additionalMounts work, and claims that native ports are Docker bindings.
- Validate every YAML snippet against the current schema shape and check that every example has a plausible image data path and documented port/environment contract.
- Check every external example link and record the upstream source in the surrounding text so future maintainers know which documentation to recheck.
- Run the repository's available documentation/lint checks; the change must not require backend, frontend, or shared code changes.
- Manually walk the guide as a new author: start from an upstream Compose example, create a template, import a folder, and identify which Compose options must be omitted because Garcon cannot represent them.
- For each community example, compare the documented image tag/digest and source fragment with the linked upstream documentation, especially the V Rising data path/ports and the Valheim optional volume/capability caveat.
- Confirm that the final documentation diff contains only the design artifact and the three documentation deliverables; do not stage or modify the pre-existing uncommitted functional changes currently present in the worktree.

## Acceptance criteria

- A new template author can follow docs/TEMPLATES.md from an image's Docker example to a valid Garcon YAML file without guessing where image environment variables belong.
- The guide clearly states that docker.environment is fixed per template, literal, image-defined, and shared by every server imported from that template; it recommends separate templates for separate fixed configurations.
- The guide accurately distinguishes Docker and native execution and documents every effective template customization.
- The guide explicitly identifies schema-accepted but runtime-ineffective fields and major Docker/Compose features Garcon cannot control.
- The guide contains working-shaped examples for Minecraft (itzg/minecraft-server), Valheim (lloesche/valheim-server), V Rising (sknnr/vrising-dedicated-server), and the generic community-image pattern, with primary-source links and caveats.
- README and development documentation no longer advertise removed variable substitution, per-server parameter inputs, or unsupported mount/working-directory behavior.
- The docs accurately describe import-folder paths, required-file checks, port defaults, image-default commands, non-root execution, native execution, and RCON shutdown behavior.
- The docs explicitly explain env_file and host-placeholder translation, plaintext template secrets, one-entry-per-container-port translation, current UI/API host-port divergence, image Entrypoint behavior, and the exact Valheim/V Rising caveats.
- No source-code, schema, API, UI, or built-in-template changes are required or included.

## Deliverables

- Updated docs/TEMPLATES.md.
- Updated template overview and example in README.md.
- Corrected template/provider notes in docs/DEVELOPMENT.md.
- This design artifact, retained as the rationale for the documentation change.
