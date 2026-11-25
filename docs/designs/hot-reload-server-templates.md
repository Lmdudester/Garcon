# Design: hot-reload server templates

## Status

Design approved. Implementation and independent review complete. Awaiting feedback on the local preview.

## Original request

Garcon currently reads the YAML files in `GARCON_DATA_DIR/templates` into an in-memory map during backend startup. Adding a new server template therefore requires restarting the backend. Make new templates available without restarting Garcon.

## Goals

- Apply valid additions and edits to direct `.yaml` files while the backend is running. Apply removals and execution-mode changes only when no server references the affected template.
- Make a newly added valid template available for server import without a backend restart.
- Keep the current valid template set available if a runtime reload sees a malformed or schema-invalid file.
- Give the frontend an explicit, deterministic refresh path so a user can open the import flow and see templates even if a filesystem notification was delayed or missed.
- Preserve the current template schema, data-directory configuration, direct-file discovery rules, and server lifecycle behavior.

## Non-goals and boundaries

- No template editor, upload flow, or template-management page.
- No recursive template discovery; only direct `.yaml` files under the configured templates directory remain supported.
- No live mutation of a running Docker container or native process. A template change is used by later imports and later lifecycle operations; it does not restart or reconfigure an already-running game server.
- No migration of existing server configuration or template snapshots.
- No new authentication model. The reload route follows the existing API's access model and should not be presented as a security boundary.
- No change to template validation rules or duplicate-ID behavior in this feature.

## Assumptions

- `GARCON_DATA_DIR/templates` is available to the backend as a local directory, including the existing Docker bind-mounted data-directory deployments.
- The existing unauthenticated/local-administration API model remains in place for this change.
- Operators write complete YAML files; the loader must nevertheless tolerate editor save sequences that emit several filesystem events.

## Current behavior and relevant code paths

- `packages/backend/src/index.ts` calls `templateService.initializeDefaultTemplates()` before starting the HTTP server.
- `TemplateService` stores parsed templates in a private `Map`. Its initialization guard prevents the startup load from running again.
- `loadTemplates()` clears that map and scans direct `.yaml` files with `listFiles`; no watcher or reload route exists.
- `server.service.ts` reads templates from the in-memory service for imports, starts, stops, and provider selection.
- The frontend loads templates once through `ServerContext` and uses them in `ImportServerDialog`.
- The existing documentation tells operators to restart the backend after adding or changing a template.

## User experience

### Primary flow: add a template

1. The operator writes a valid `new-game.yaml` directly under the configured templates directory.
2. The backend filesystem watcher receives one or more events and schedules one debounced reload.
3. The backend parses all direct `.yaml` files. On success it atomically replaces the in-memory map and logs the new count.
4. The operator opens the existing **Import Server** dialog. Opening the dialog asks the backend to perform a deterministic reload, then refreshes the template list. The new template appears in the existing **Game Template** selector without restarting Garcon.
5. Selecting the template continues to use the existing description, port, environment-parameter, and required-file UI.

The explicit reload performed when the dialog opens is intentional: it gives the user a reliable foreground path even when a host filesystem or Docker bind mount delays a watcher event. The watcher remains useful for direct API consumers and for keeping the backend cache current between UI interactions.

### Success, loading, empty, and error states

- While the import dialog refreshes templates, its selector remains usable with the current list and shows a loading placeholder when no current list is available. The import submit button is disabled and the submit handler guards against submission until the foreground template refresh completes, so a stale selection cannot race the reload. After refresh, submission also requires a valid `selectedTemplate` from the new list.
- On success, the refreshed list replaces the prior list and the existing template details/default-port behavior remains unchanged.
- If there are no templates, the selector keeps its existing empty state.
- If reload fails, the backend keeps the last valid map and logs sanitized details. The import dialog still fetches the active list and shows an error toast. For protected-ID conflicts, the toast uses the safe server message with the affected IDs and recovery instructions. For other reload failures, it directs the operator to check the backend logs and reopen the dialog after correcting the files. A successful final list request makes that list usable. If the list request fails, mark any previous display stale and disable import submission until a later list request succeeds.
- A watcher failure is non-fatal: the backend logs it and continues serving the last valid map. The dialog-open reload remains the recovery path.
- Reload is non-destructive and requires no confirmation dialog.

### Accessibility and responsive behavior

- Reuse the existing `Select`, dialog, toast, and loading-placeholder patterns; no new interaction model is introduced.
- Keep the template refresh status in the existing dialog's accessible name/description flow, and expose any transient loading or error message through the existing toast/aria-live behavior.
- The dialog remains responsive at its current widths; no new fixed-width content is added.

## Technical design

### Template service

Update `packages/backend/src/services/template.service.ts` to separate parsing from committing:

1. Read and validate all candidate files into a new local `Map` without mutating the active map. The template-directory scan must distinguish a genuinely empty directory from a missing/unreadable directory; a runtime scan failure is not an empty template set.
2. For the initial startup load, preserve the current behavior of logging invalid files and retaining valid files so an unrelated bad template does not prevent Garcon from starting.
3. For a runtime reload, if any file cannot be read, parsed, or validated, reject the candidate set, retain the active map, and return/raise a reload failure with safe filename-level details.
4. Check the candidate against the server references described below immediately before replacing the active map in one assignment. Run the reference check and assignment synchronously. A missing or unreadable templates directory must reject the runtime candidate and preserve the active map. Keep the existing behavior of `listFiles` for backup callers by using a strict scan for templates.
5. Keep `initializeDefaultTemplates()` idempotent. Add an explicit runtime reload operation that does not depend on the initialization guard.

The service should be constructible against a supplied templates directory (defaulting to `config.paths.templatesDir`) so reload behavior can be tested with isolated temporary directories without changing production configuration.

### Filesystem watcher

Add lifecycle methods to `TemplateService`:

- `startWatching()` creates one `fs.watch` subscription for the configured templates directory. Start it after both the initial template load and server registry initialization so the first reload sees existing references.
- Events for `.yaml` files, rename events, or events without a filename schedule a reload after a short debounce (approximately 250 ms). This handles common editor temp-file/rename sequences without repeated parsing.
- Reload attempts are serialized. If a new event arrives during a reload, one follow-up reload is scheduled after the current attempt completes.
- `stopWatching()` marks the watcher inactive (or advances a watcher generation) before clearing timers/closing the handle; an in-flight reload checks that guard before scheduling any follow-up timer. Shutdown and tests therefore cannot be undone by a late completion callback.
- Watcher and debounce errors are logged but do not terminate the backend or clear the active map.
- `stopWatching()` clears timers and closes the watcher for process shutdown and tests.

Wire the watcher into backend startup after `serverService.initialize()`. Install the reference callback, attempt watcher attachment, and then enqueue one catch-up scan through the serialized runtime reload path regardless of whether attachment succeeds. This covers changes during provider reconciliation and server discovery. A failed scan is non-fatal. Make the watch handle and debounce timer non-persistent and register `stopWatching()` with Fastify's close lifecycle for explicit shutdown and tests. Preserve the process's default signal handling.

### Reload API

Add to `packages/backend/src/routes/template.routes.ts`:

```text
POST /api/templates/reload
```

The route has no request body. It invokes the service's runtime reload operation and returns the loaded template count. Validation failures use the existing error shape with filenames and sanitized reasons. A protected-reference conflict returns 409 using the existing conflict shape and identifies the template IDs the operator needs to restore. A directory scan failure uses the existing filesystem-error shape with a generic directory message. Every failure preserves the active map. The route exposes template metadata through the existing list and detail calls only.

### Frontend refresh behavior

Update the existing template API/context and `ImportServerDialog` only:

- Add an API client method for `POST /templates/reload`.
- Keep the application startup load list-only so the home page never waits for a disk scan. On opening the import dialog, run the foreground reload before issuing the list request, alongside the existing import-folder lookup. Issue that list request even if the reload fails and surface both outcomes separately. A failed list marks the displayed templates stale. Disable and guard submit while the foreground refresh is pending and until its list request succeeds.
- Use a shared request generation for startup and foreground template requests. Only the latest request may update the list, freshness, pending state, or error feedback. This keeps a late startup list from overwriting the foreground result. If the dialog closes and reopens while a refresh is pending, start a fresh request and use the latest generation for submission gating.
- Treat defaults and user edits separately. Derive untouched port mappings from the latest selected template and keep a port draft once the user edits the mappings. A different or removed template ID clears the dependent drafts. Gate submission on the presence of the current `selectedTemplate`.
- Store only edited parameter inputs in the environment draft. Display the latest non-secret default for an untouched field and leave an untouched secret field blank. Let the backend apply current defaults by submitting only non-empty edits for parameters still declared by the selected template. The refreshed definitions drive required-field checks. A blank edit retains the existing behavior of omitting the override.

### Active servers and compatibility

- A newly added template is available to `server.service.ts` through the existing `getTemplate` path once the map is swapped.
- Because template reloads can occur between asynchronous operations, `server.service.ts` start/stop paths must select the execution provider from the exact `Template` object already fetched for that operation, rather than fetching the same `templateId` a second time. This keeps execution mode, command, and provider generation consistent.
- Running game processes are not restarted or altered by a reload.
- Protect template IDs referenced by any registered server, including stopped and crashed servers, and by in-progress imports. A runtime reload rejects the entire candidate if it removes a protected ID or changes its execution mode. Compare the active and candidate entries, so a duplicate file that changes the winning execution mode also triggers the guard. Use a new ID for a different execution mode. An unused template can be removed or change execution mode.
- Supply the protected IDs to the reload service through a synchronous callback wired during startup, keeping the template service independent of the server service. The server service computes them from its registry and a ref-counted set of pending import IDs. Acquire the import's reference and read its template from the initialized registry in the same synchronous section before validating or copying files. Release the reference in `finally`, after server registration on success. Deletion keeps its reference until process and directory cleanup succeed and the server is removed from the registry.
- If a legacy server already references an absent template at startup, keep its registry entry and log the missing ID. Skip its provider status lookup. After looking up the server, check its template before checking lifecycle status or changing state in start, stop, delete and crash acknowledgement. Return an actionable restore-and-restart error before any provider operation or file deletion when the template is missing. A reload may add other IDs, but must reject adding a missing ID referenced by a legacy server because the previous execution mode is unknown. To recover that server, restore its original template and restart Garcon. Reload rejection for a protected ID provides that instruction. Continuing to leave a legacy ID absent does not block unrelated reloads.
- No persisted data format or migration is needed.
- The existing direct `.yaml` discovery and schema contract remain unchanged.

### Error handling and observability

- Startup continues to log invalid template files as it does today.
- Runtime watcher failures and rejected candidate reloads are logged with the triggering path/event context and affected filenames or template IDs. Use a quiet read/parse path for runtime candidate loading because the existing `readYaml` helper logs raw errors and YAML parser diagnostics can include source lines. Log sanitized error categories and omit raw exception messages, YAML source, and template values from runtime logs and API errors.
- A missing or unreadable templates directory is logged as a reload failure and never replaces a non-empty active map with an empty one.
- Successful reloads log the loaded template count.
- The backend remains available with the last valid runtime map after any reload failure.

## Affected files

- `packages/backend/src/services/template.service.ts`: candidate loading, atomic runtime reload, watcher lifecycle, and testability injection.
- `packages/backend/src/routes/template.routes.ts`: reload endpoint.
- `packages/backend/src/index.ts` and `packages/backend/src/app.ts`: watcher startup after server discovery, protected-ID callback wiring and close cleanup.
- `packages/backend/src/services/server.service.ts`: protection for registered servers and pending imports, consistent provider selection, and explicit missing-template errors.
- `packages/backend/src/services/template-parameter.service.ts`: distinguish submitted overrides from inherited object properties when applying template defaults.
- `packages/frontend/src/lib/api.ts`: reload API method.
- `packages/frontend/src/context/ServerContext.tsx`: reload-then-list template refresh and state handling.
- `packages/frontend/src/components/servers/ImportServerDialog.tsx`: refresh on open and loading state.
- `packages/backend/src/services/template.service.test.ts`: reload, invalid-candidate retention, and watcher lifecycle coverage.
- `packages/backend/src/services/server-template-reload.test.ts`: lifecycle provider and pending-import coverage.
- `README.md` and `docs/TEMPLATES.md`: update every template-discovery/troubleshooting instruction that currently says a backend restart is required. Both documents must explain automatic runtime reload, import-dialog foreground refresh, and restart as a fallback only.

No existing unrelated modified files will be reformatted, reverted, or expanded as part of this work.

## Test strategy

### Automated

- Service test: a valid template added after initialization is absent before reload and present after reload.
- Service test: a valid template edit is reflected after reload.
- Service test: a valid unused template deletion or execution-mode edit is reflected after reload. A referenced template deletion or execution-mode edit is rejected, retains the active map, and leaves cleanup using the original provider for both stopped and crashed servers.
- Service test: a malformed or schema-invalid candidate leaves the prior active map unchanged and reports/logs the failure.
- Service test: a runtime reload whose templates directory is missing/unreadable fails and leaves the prior active map unchanged rather than committing an empty map.
- Service test: multiple watcher events are debounced into one reload, and a watcher error does not throw out of the service.
- Startup regression check: an addition after the initial scan and before the watcher attachment attempt becomes available through the catch-up reload without an API POST or another file event, including when watcher attachment fails.
- Server lifecycle regression test: a template reload between template retrieval and provider selection cannot mix one template generation's execution mode/provider with another generation's template configuration.
- Server lifecycle regression tests: a reload racing a pending import cannot remove or change its provider, and a failed import releases its reference. Legacy missing-template stop, delete and crash acknowledgement return the restore-and-restart error regardless of the inferred status, without calling either provider or removing server files. Reintroducing the missing protected ID rejects the whole candidate. After removing the conflicting file, an unrelated addition reloads while the legacy ID stays absent.
- Route test or focused app injection test: `POST /api/templates/reload` returns success/count and returns the existing validation error shape on failure.
- Frontend type/build checks: the new API/context/dialog flow compiles and preserves the existing import form behavior.
- Frontend behavior check: removing the currently selected template during a refresh clears the selection and prevents submission until another valid template is chosen.
- Frontend behavior check: attempting to submit while the dialog's foreground template refresh is pending is blocked, even if the old list had a selected template.
- Frontend behavior check: refreshing the template list while a template remains selected does not overwrite user-edited ports or environment values; selecting a different template still initializes that template's defaults.
- Frontend behavior check: a refreshed same-ID template with a removed parameter submits only the still-declared fields and preserves the user's edits to those fields.
- Frontend behavior check: a same-ID refresh updates untouched defaults for ports and parameters while retaining user edits. Untouched parameter defaults never go into the import payload as overrides.
- Frontend behavior check: overlapping refresh requests cannot apply an older response over the newest template list.
- Frontend behavior check: initial page load only fetches the cached list. Opening the import dialog issues its own reload and list, and a late initial list cannot replace the foreground result.
- Frontend behavior check: if the final list request fails, stale displayed templates cannot be submitted until a later list request succeeds.
- Documentation check: neither README nor the template guide instructs an operator to restart for an ordinary valid template addition; both document watcher behavior, foreground refresh, and the safe fallback for reload failures.

### Manual verification

1. Start Garcon using the normal development or production command.
2. Add a valid `.yaml` template under the configured data directory while the process remains running. On a watchable directory, poll `GET /api/templates` for the new ID within a bounded wait. Do this before opening the import dialog or making a reload POST so the check exercises only filesystem watching.
3. Open **Add Server → Import Server** and verify the template appears without a backend restart. Repeat with the watcher disabled or with a deliberately missed event to verify the foreground fallback separately.
4. Import a server using the new template and verify normal validation/default-port behavior.
5. Temporarily introduce invalid YAML and verify the existing template list remains usable, the UI reports a refresh failure, and backend logs identify the file.
6. Correct the file and reopen the dialog; verify the template becomes available.

## Rollout and fallback

- This is a backward-compatible runtime behavior change; existing deployments need one normal restart to install the new code, after which future template additions do not.
- If the watcher is unsupported or unreliable for a particular mount, opening the import dialog invokes the explicit reload route.
- If a reload fails, correct the YAML or restore the protected template and retry. A restart loads the files currently on disk, so restore any required template with its original execution mode before restarting. Both operator guides must explain this rule.

## Unresolved questions

None for the requested scope. The existing API has no authentication layer; adding authorization for the reload route would be a separate security feature rather than part of template hot reload.

## Review ledger

The first four passes fixed D1 through D11. The fifth attempt found D12 and closed the two remaining lenses while they were still running. The user authorized a new review cycle. Its first pass completed with replacement reviewers and produced D15 through D17. The second pass produced D18 through D21. The third pass produced D22. The fourth pass completed all three lenses with no accepted important issues.

| ID | Lens | Status | Evidence or correction |
| --- | --- | --- | --- |
| D1 | UX/UI coherence | FIXED | A removed selected template could leave a stale ID submittable. The design now requires clearing the selection/dependent state and gating submission on `selectedTemplate`. |
| D2 | Outcome coverage | FIXED | A cold load could suppress the list request after reload failure. The design now requires always fetching the last-valid list after a failed reload while preserving the error toast. |
| D3 | Technical accuracy and practicality | FIXED | A transient missing template directory could be treated as an empty set. The design now requires strict directory-scan failure handling and preservation of the active map. |
| D4 | UX/UI coherence | FIXED | A stale template could be submitted while foreground refresh was pending. The design now requires disabling and guarding submit until refresh settles. |
| D5 | Technical accuracy and practicality | FIXED | An in-flight watcher reload could reschedule work after `stopWatching()`. The design now requires an inactive/generation guard before follow-up scheduling. |
| D6 | Outcome coverage | FIXED | Optional documentation updates could leave stale restart instructions. The design now requires updating both README and `docs/TEMPLATES.md`, including every relevant instruction. |
| D7 | UX/UI coherence | FIXED | Refreshing the template array could overwrite user-edited import ports/environment values. The design now preserves drafts across same-ID refreshes and clears them on template-ID changes. |
| D8 | Outcome coverage | FIXED | Missing-directory safety lacked a regression test. The design now requires a test proving reload failure leaves the active map unchanged. |
| D9 | Outcome coverage | FIXED | Overlapping frontend refreshes could apply an older response over a newer list. The design now requires coalescing or request-generation guards. |
| D10 | UX/UI coherence | FIXED | A failed final list request could leave stale displayed templates submittable. The design now requires a fresh-list state and disabled submission until a list succeeds. |
| D11 | Technical accuracy and practicality | FIXED | A reload between template fetch and provider selection could mix lifecycle generations. The design now requires provider selection from the exact fetched template and a regression test. |
| D12 | Technical accuracy and practicality | FIXED | Protect referenced IDs against removal and execution-mode changes, and fail safely when a legacy reference has no template. Cover stopped and crashed servers and imports racing a reload. |
| D13 | UX/UI coherence and outcome coverage | INCOMPLETE | Both lenses were still running when the fifth attempt closed. The resumed review covers both lenses with fresh reviewers. |
| D14 | All three lenses | INCOMPLETE | Initial reviewers in resumed pass 1 hit the deadline. One replacement per lens completed the pass. |
| D15 | Outcome coverage | FIXED | Require testing that reusing a missing legacy ID is rejected, then verify an unrelated addition still works. |
| D16 | Technical accuracy and practicality | FIXED | Queue a catch-up scan after watcher attachment for changes between startup enumeration and watcher registration. |
| D17 | UX/UI coherence | FIXED | Keep initial page loading list-only and protect the foreground result from an older startup request. |
| D18 | Technical accuracy and practicality | FIXED | Run the startup catch-up scan even if watcher attachment fails. |
| D19 | Technical accuracy and practicality | FIXED | Check a legacy server's template before lifecycle status checks and test the actionable stop and crash errors. |
| D20 | Outcome coverage | FIXED | Verify that watcher events alone publish a new template to the read-only API. Exercise the dialog's fallback separately. |
| D21 | UX/UI coherence | FIXED | Filter import environment values to the refreshed template's declared parameters. |
| D22 | UX/UI coherence | FIXED | Derive untouched port and parameter defaults from the latest selected template. Send only actual, still-declared parameter overrides. |
| D23 | Outcome coverage | REJECTED | The suggested persistence assertion adds confidence. The existing import resolver already applies omitted defaults and writes the resolved environment. No change to that contract is proposed. |
| D24 | Technical accuracy and practicality | REJECTED | The existing dialog already checks `hasDefault` on the selected parameter definition. The design retains that behavior with refreshed definitions, and the suggested variant did not identify a regression in that predicate. |
| D25 | UX/UI coherence | REJECTED | The suggested remove-and-restore sequence needs two foreground refreshes in one open dialog. The design refreshes once per open, ignores superseded responses, and the dialog clears drafts on close. |

## Implementation review

Four passes completed. The fourth pass produced no accepted important findings.

| ID | Lens | Status | Evidence or correction |
| --- | --- | --- | --- |
| I1 | Design adherence | FIXED | Reserve the template before the first asynchronous import path check and test that boundary. |
| I2 | Code quality and extensibility | FIXED | Avoid emitting unresolved-tag warnings containing YAML source text. |
| I3 | Outcome coverage | FIXED | Give stopped and crashed servers separate template IDs so tests prove each reference prevents removal and provider changes. |
| I4 | Code quality and extensibility | INCOMPLETE | The first reviewer missed the pass 2 deadline. The replacement completed the lens with no distinct issue. |
| I5 | Outcome coverage | FIXED | Suppress collection-key conversion warnings and verify the process emits none. |
| I6 | Code quality and extensibility | FIXED | Check YAML parser errors before suppressing conversion diagnostics so multi-document files are still rejected. |
| I7 | Outcome coverage | REJECTED | The multi-document fixture requires its own filename-level issue. All issues share one rejection check before the candidate map can be returned, and the test already checks active-map retention. |

All 29 backend tests and the shared, backend and frontend builds passed. A live preview published a new YAML file through the read-only API before any reload POST, imported from it, and kept the catalog on an invalid reload. A narrow-viewport browser check covered keyboard selection, pending and stale states, overlapping refreshes, draft edits, parameter removal and import defaults. The preview used disposable data and a disconnected Docker endpoint.
