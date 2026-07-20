# Codex Edit Log

All entries in this file document changes made by Codex in this repository.

## 2026-07-20 - Graph validation foundation

### Why this was first
The project is moving from a fixed controller demo to an editable dataflow graph. Before adding more lessons or nodes, invalid wires and cyclic graphs must be rejected consistently by both the editor and deterministic simulation.

### Changes
- Added `packages/core/src/graph/validate.ts`.
- Defined the current port schema for every registered node.
- Added validation for unknown nodes/ports, missing source nodes, incompatible port types, cycles, and required steer/throttle outputs.
- Exported graph validation through `@apex/core`.
- Prevented the React Flow editor from accepting incompatible, self-referential, or duplicate-input connections.
- Made the editor's runnable-graph check use the same core validator.
- Added validation coverage to the core headless test suite.

### Verification
- `pnpm --filter @apex/core test`
- `pnpm --filter @apex/web build`

### Next recommended work
1. Surface validation messages in the editor so learners know why a graph cannot run.
2. Turn the current L1 standard-library builtins into openable composite graphs.
3. Complete level objectives, success states, and unlock progression for levels 1 through 4.

## 2026-07-20 - UX and visual-system overhaul (complete)

### Scope
- Add actionable graph validation feedback and safe run gating.
- Make levels 1-4 require meaningful graph construction.
- Start simulations paused and provide clear reset/retry actions.
- Add a resizable desktop workspace and mobile graph/simulation tabs.
- Improve campaign progression, theme support, accessibility, and visual hierarchy.
- Verify core behavior, production build, and desktop/mobile layouts.

### Progress
- [x] Graph feedback and run gating
- [x] Level objectives and starter graphs
- [x] Responsive workspace
- [x] Campaign and theme polish
- [x] Tests and visual verification

### Completed result
- Unified core validation and editor feedback for incompatible, duplicate-input, cyclic, and incomplete active paths.
- Added visible graph readiness, disabled execution states, deterministic restart-on-edit, and retry controls.
- Rebuilt level 1-4 starter graphs as incomplete challenges and added required-concept checks.
- Added desktop split resizing, mobile graph/simulation tabs, compact mobile node layout, and horizontal mobile palette.
- Reworked campaign cards into a mission path with progress, status, rewards, and continuation CTA.
- Added persistent light/dark themes, focus visibility, reduced-motion support, larger port hit areas, and accessible control labels.
- Corrected tutorial copy so it matches click-to-connect behavior and run gating.
- Corrected SPA scroll restoration between campaign and level screens.

### Visual QA
- Desktop: 1440x900, campaign and tutorial workspace.
- Mobile: 390x844, campaign, graph tab, and simulation tab.
- Themes: light and dark.
- Interaction: add Const, connect to THROTTLE, verify Run becomes enabled.
- Browser console: no errors.

## 2026-07-20 - Game-feel and parts-bay pass (complete)

### Feedback addressed
The level workspace felt like an educational IDE, and the fixed node palette consumed a full-height column while containing very little useful content.

### Changes
- Replaced the fixed palette sidebar with a floating, toggleable `PARTS BAY` loadout.
- Reframed node addition as installing control parts instead of choosing classroom blocks.
- Added `BUILD MODE / CONTROL GRAPH` and `LIVE CIRCUIT` workspace states.
- Updated connection and readiness copy to use signal, link, control-online, and race-ready language.
- Added a more atmospheric graph background, stronger node/edge treatment, and compact part cards.
- Renamed the primary simulation action to `주행 시작`.

### Follow-up fix and verification
- Fixed a zero-height React Flow container introduced by the floating palette layout; graph nodes and links now render across the full editor height.
- Confirmed the compact Parts Bay opens and closes without reserving a permanent sidebar.
- Desktop visual QA: 1440x900, full graph, Parts Bay, circuit panel, and control states visible.
- Mobile visual QA: 390x844, graph/simulation tabs, two-column nodes, and Parts Bay overlay verified.
- `pnpm --filter @apex/core test`: all checks passed.
- `pnpm --filter @apex/web build`: production build passed.

## 2026-07-20 - Blank first-build onboarding (complete)

### Feedback addressed
The first mission previously opened with an almost-complete steering graph, which made the experience feel like repairing an example instead of building a controller.

### Changes
- Replaced the first mission starter graph with a completely empty canvas.
- Added Const and THROTTLE to the first Parts Bay so both parts are installed by the player.
- Expanded guided onboarding to: install Const, install THROTTLE, connect ports, start driving, and confirm ignition.
- Allowed the onboarding simulation to run with its intentionally minimal throttle-only graph while preserving full-output validation for later missions.
- Added specific empty, missing-part, and missing-link status messages.

### Verification
- Confirmed the first editor opens with zero graph nodes.
- Confirmed both parts can be installed and connected through click-to-connect.
- Confirmed Run enables only after the link is complete.
- Confirmed the car accelerates and the guided flow reaches ignition success.
- `pnpm --filter @apex/web build`: production build passed.
