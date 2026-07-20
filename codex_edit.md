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

## 2026-07-20 - Level 1 guided speed-control build (complete)

### Goal
Extend the successful blank-canvas onboarding into the first full controller mission without exposing a prebuilt example graph.

### Changes
- Pushed the previous game-first campaign baseline to origin/main at commit 46215c1.
- Replaced the Level 1 starter with a completely empty player canvas.
- Moved Pure Pursuit steering into a hidden, clearly labeled STEERING ASSIST used only by the Level 1 simulation.
- Added an 11-stage guided build for Speed, target Const, Sub, PID, Clamp, and THROTTLE.
- Unlocks only the next required part after the current installation or wiring objective is complete.
- Added mission-specific graph validation so Level 1 requires a complete throttle path while later missions still require both outputs.
- Added Undo and Reset controls for node additions, links, deletions, and parameter edits.
- Added automatic graph framing after part installation and recovery actions.
- Set the Level 1 target-speed Const default to 8 m/s.

### Verification
- Confirmed all 11 build stages and exact port connections.
- Confirmed Undo returns the mission to the previous stage and Reset restores the blank canvas.
- Confirmed completed player graph plus steering assist finishes a clean lap in 27.52s.
- Confirmed mission completion and next-level action.
- Confirmed desktop and 390x844 mobile layouts.
- Aligned the editor CONTROL ONLINE state with each mission-specific output requirement.

## 2026-07-20 - Level 2 guided Pure Pursuit build (complete)

### Goal
Turn the steering mission into a full blank-canvas build while keeping the already-learned speed controller out of the player workspace.

### Changes
- Replaced the Level 2 starter graph with a completely empty canvas.
- Moved the completed PID speed controller into a hidden THROTTLE ASSIST used only by the Level 2 simulation.
- Added a 19-stage guided Pure Pursuit build from Pose and Track through Lookahead, car-frame conversion, curvature, gain, and STEER.
- Unlocks each part only after the prior installation or exact port connection is complete.
- Distinguishes the two Const nodes with defaults of 6 m lookahead and 1 steering gain.
- Uses mission-specific validation requiring a complete steer output while the assist supplies throttle.

### Verification
- Confirmed all 19 installation and connection stages.
- Confirmed both Const defaults and exact source-node identity checks.
- Confirmed the completed player steering graph plus throttle assist finishes a clean lap in 27.52s.
- Confirmed mission completion, next-level action, Undo/Reset compatibility, and automatic framing.
- Confirmed desktop and 390x844 mobile layouts.
