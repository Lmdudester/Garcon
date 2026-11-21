# Server control color and stop confirmation

## Original issue

The server cards currently render the `Start` action with the shared default (blue in the dark theme) button styling and the `Stop` action with the shared secondary styling. The stop action is visually too easy to hit while interacting with nearby links, and a single accidental click immediately calls the server stop API.

## Goals

- Make `Start` a clearly positive, filled green action.
- Make `Stop` a clearly destructive, filled red action.
- Require two deliberate clicks to stop a running server:
  1. The first click changes the button into a temporary `Confirm Server Stop` action.
  2. The confirmation action shows a five-second countdown and only calls the existing stop API when clicked during that window.
- Keep the behavior local to each server card and preserve the current server lifecycle API and state model.

## Non-goals

- No backend, API, persistence, or server lifecycle changes.
- No confirmation flow for `Start`, `Restart`, crash acknowledgement, updates, or delete.
- No new modal or global confirmation component.
- No changes to the existing server status labels or link behavior.

## Current implementation and constraints

- `packages/frontend/src/components/servers/ServerControls.tsx` owns the `Start`, `Stop`, and `Restart` actions and calls `useServers()` methods.
- `packages/frontend/src/components/ui/button.tsx` provides the shared button focus, disabled, and size behavior.
- `packages/frontend/src/index.css` and `packages/frontend/tailwind.config.js` expose theme tokens, while existing UI code also uses `green-500` and `red-500` utility colors for status indicators, connectivity, toasts, and destructive dialogs.
- The frontend has no component-test setup; the repository's automated frontend checks are TypeScript, lint, and production build checks.

## User experience

### Normal states

- When a server is stopped, the `Start` button remains available, uses a filled green treatment, and keeps the existing play icon and `Start` label.
- When a server is running, the `Stop` button is available, uses a filled red treatment, and keeps the existing square icon and `Stop` label. `Restart` remains unchanged.
- Existing loading and transitioning rules continue to disable actions.

### Stop confirmation flow

1. The user clicks the red `Stop` button.
2. No API call is made. The same focused button changes to `Confirm Server Stop (5)` and starts a five-second countdown.
3. Each second, the visible number decreases: `4`, `3`, `2`, `1`.
4. If the user clicks the confirmation button before the countdown expires, the confirmation state is cleared and the existing `stopServer(server.id)` operation is called. The button is disabled while the operation is loading, and the existing WebSocket/status flow controls the later `stopping` and `stopped` states.
5. If the countdown reaches zero without confirmation, the button returns to the normal red `Stop` label and no API call is made.

The countdown is a five-second confirmation window, not an automatic delayed stop. The server never stops solely because the timer expires.

### Alternate and edge states

- If the server status leaves `running` while confirmation is active (for example, a remote client starts or stops it), the confirmation state is cleared, the live region announces that the confirmation was cancelled because the server status changed, and the normal status-specific controls render. Track whether the temporary confirmation currently owns focus; only if it does, move focus after the render to the first available enabled server action, or to a stable programmatically focusable server-controls container when none exists. If the user has already tabbed elsewhere, do not steal focus.
- If the component is reused for a different server, the pending state is scoped to the original `server.id`; the new server renders the normal `Stop` action synchronously, and a stale confirmation event cannot call `stopServer` for the new server.
- If the stop request fails, the existing context error toast and error propagation remain in place; loading ends and the user can retry through the normal `Stop` flow.
- If the server is deleted or the control unmounts, the countdown timer is cleaned up and cannot update unmounted state.
- The existing responsive flex-wrap layout remains unchanged; the longer confirmation label may wrap with the other controls on narrow cards without changing the card structure.

### Accessibility and visual consistency

- The actions remain native buttons and retain the shared focus-visible ring, disabled behavior, and keyboard activation.
- The button label itself communicates the destructive confirmation action and the remaining seconds; no color-only meaning is introduced.
- Add a visually hidden, atomic `role="status"`/`aria-live="polite"` announcement for the confirmation window opening and expiring (for example, “Server stop confirmation active. Confirm within five seconds.” and “Server stop confirmation expired.”). Do not rely on color or the changing visual label as the only announcement. Clear the live-region message on confirmation, failed request, remote status change, and server-switch exits. Expiry instead replaces the message with the expiry announcement and leaves that announcement rendered until the next attempt; the next attempt clears it before issuing a fresh active announcement.
- The filled colors use explicit, readable utilities from the existing green/red visual language: `bg-green-700 text-white hover:bg-green-800` for `Start` and `bg-red-600 text-white hover:bg-red-700` for both `Stop` and `Confirm Server Stop`. Do not use the shared `destructive` variant for these two controls because its dark-theme token is not the requested bright red.
- Keeping one button element in the running-server control slot allows focus to remain on the action while its label and handler change.

## Technical plan

### Affected files

- `packages/frontend/src/components/servers/ServerControls.tsx`

### State and behavior

- Add `STOP_CONFIRMATION_SECONDS` and `STOP_CONFIRMATION_DURATION_MS` constants representing a five-second window.
- Add component-local state holding either no pending confirmation or `{ serverId: string; expiresAt: number }`, where `expiresAt` is `Date.now() + STOP_CONFIRMATION_DURATION_MS`. Derive the displayed remaining seconds from that timestamp using a ceiling calculation, and treat confirmation as active only when the stored `serverId` equals the current `server.id`.
- Add a timer effect that refreshes the displayed seconds once per second, clears its timer on cleanup, and clears the pending state when the absolute expiry is reached. The timer is only a display/state-refresh mechanism; it is not the source of truth for whether confirmation is allowed. The render and click handlers must synchronously gate on the matching `serverId` so a reused component cannot expose or execute the old server's confirmation during the post-render reset.
- Add an effect to clear pending confirmation when the server is no longer running and when the control switches to another server. When a status change cancels an active confirmation, update the live-region message and, only when a focus-ownership ref recorded that the confirmation button was focused, restore focus after the new controls render.
- Split the current stop handler into an initial confirmation handler and a confirmed stop handler. Only the latter sets loading and calls `stopServer`.
- In the confirmed stop handler, capture the pending `{ serverId, expiresAt }` and compare both its `serverId` and `Date.now()` with the current server before calling `stopServer`. If the timestamp is missing or belongs to another server, clear only the matching stale state and return; if it is expired, call the same `expireStopConfirmation` helper used by the timer, announce expiry, and return without an API call. This keeps the five-second limit and server identity correct even if browser timers are throttled or delayed or the component is reused.
- Track the live-region message separately so the opening and expiry announcements are emitted once per state transition rather than announcing every one-second visual decrement. Use one `expireStopConfirmation` helper for timer and late-click expiry paths, and give each new opening a fresh live-region instance or a clear-then-next-frame update after the prior message has rendered, preventing a prior identical message from suppressing the next announcement.
- Give the existing controls wrapper a ref and `tabIndex={-1}` fallback target, and track confirmation-button focus with a ref. Snapshot whether the confirmation button owns `document.activeElement` before the status-driven render/unmount (for example, in a layout-effect cleanup or equivalent pre-removal step) and preserve that cancellation snapshot through teardown so an unmount-triggered `blur` cannot erase it. While the confirmation remains mounted, user-initiated focus changes update ownership normally. On status-change cancellation, consult the preserved snapshot; if the confirmation owned focus, use the wrapper to find the first enabled button after render and focus it, or focus the wrapper itself when no enabled action is available. If focus ownership is false, leave the user's current focus untouched. Announce cancellation through the same polite atomic live region, replacing that message on the next confirmation attempt.
- Render the running-server stop slot as one button whose class, label, and click handler depend on whether confirmation is pending. Start uses `bg-green-700 text-white hover:bg-green-800`; normal and confirmation stop use `bg-red-600 text-white hover:bg-red-700`. Restart keeps its existing outline variant.

No shared type, context, API client, backend route, persistence, or websocket message changes are required.

## Acceptance criteria

- `Start` uses `bg-green-700 text-white hover:bg-green-800` and is visibly green and filled on stopped server cards.
- `Stop` and `Confirm Server Stop` use `bg-red-600 text-white hover:bg-red-700` and are visibly red and filled on running server cards.
- The first click on `Stop` makes zero stop API calls and displays `Confirm Server Stop` with a countdown beginning at `5`.
- Clicking the temporary confirmation action before the absolute five-second expiry makes exactly one stop API call; a click after expiry makes no API call and resets the button.
- Waiting through the full countdown returns to `Stop` without making a stop API call.
- Start, restart, loading, transition, error-toast, and server-status behavior remains otherwise unchanged.
- Pending timers are cleaned up when the control unmounts or the server leaves the running state.
- The confirmation opening and expiry are announced through a polite, atomic live region without requiring screen-reader users to infer the state from color or a changing visual label.
- A remote/status-change cancellation announces why the confirmation disappeared and does not leave keyboard focus lost; focus returns to an available action or the stable controls container.
- TypeScript, lint, and production build checks pass.

## Test strategy

### Automated checks

- Run the frontend typecheck, lint, and production build through the repository's pnpm scripts.
- Because no frontend component-test harness exists, validate the timer and API-call sequence with a focused manual browser check against a running Garcon instance.

### Manual verification

For a stopped server, verify the green `Start` button starts the server as before. For a running server:

1. Click `Stop` once and verify the server remains running, the button reads `Confirm Server Stop (5)`, and the number decrements once per second.
2. Let the countdown expire and verify the button returns to `Stop` without the server entering `stopping`.
3. Click `Stop`, then click the confirmation action before expiry, and verify the server enters the existing stopping flow exactly once.
4. Trigger the confirmation state, then cause the server status to change or navigate so the card unmounts; verify no stale timer update or console error occurs.
5. Check keyboard focus/activation and visible focus styling for both the normal and confirmation labels, including a narrow viewport.
6. Use the browser accessibility tree or a screen reader to verify the active, expired, cancelled, and repeated-confirmation live-region announcements. Keep focus on the confirmation button during a remote status change and verify focus moves to the first available action or stable controls container; tab to another control first and verify the status update does not steal that focus.
7. Reuse the control with a different server while confirmation is pending and verify the new server shows normal `Stop`, the old countdown does not appear, and clicking the new server's controls cannot stop it without a fresh two-click sequence.

## Rollout and fallback

This is a client-only, low-risk interaction change with no migration or rollout flag. Reverting the single component change restores the previous controls and API behavior. The design artifact remains with the implementation for traceability.

## Unresolved questions

None. The requested five-second window is interpreted as the period during which the temporary confirmation button can be clicked; expiry cancels the pending stop rather than stopping automatically.
