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

## 2026-07-20 - Graph port row alignment fix (complete)

- Removed a duplicate header offset from React Flow handle positioning.
- Input and output handles now align with the vertical center of their corresponding label rows.
- Multi-input nodes such as Sub and Lookahead inherit the corrected alignment.

## 2026-07-20 - Level 1 straight speed trial (complete)

- Removed the hidden Pure Pursuit steering graph from Level 1.
- Replaced the circuit lap objective with a flat straight proving-ground speed test.
- Level 1 now requires the player-built throttle controller to reach 8 m/s and hold it for 2 seconds.
- Added DYNO-specific run labels, target-speed HUD, hold-time progress, and completion feedback.
- Kept circuit lap driving behind Level 2, where localization, track input, and steering are introduced.
- Verified the full guided build and a successful target lock in 2.87s at 4x simulation speed.

## 2026-07-20 - Mission-specific venues (complete)

- Added a dedicated world factory so every campaign mission loads its own track geometry and venue identity.
- First Ignition now uses a wide, flat pit apron; Level 1 keeps its long flat velocity straight.
- Level 2 now runs on the wide ORBIT flow loop for Pure Pursuit steering.
- Level 3 now runs on the RIDGELINE switchback course, with its calibrated clean-lap target updated from 24s to 32s.
- Level 4 now runs through the narrow SENSOR CANYON S-course to make LiDAR gap selection meaningful.
- Added venue and layout names to the live simulation header.
- Headless verification: L2 completed graph clean at 35.15s, L3 completed graph clean at 30.72s, and L4 completed graph clean at 26.12s.
- Visually verified the distinct ORBIT and RIDGELINE layouts in the running app.

## 2026-07-20 - Contextual block explanations (complete)

- Added a contextual PART GUIDE tooltip for both Parts Bay blocks and placed graph nodes.
- Tooltips explain the block purpose, robotics meaning, and input/output port names without interrupting the build flow.
- Added viewport-aware positioning so the card flips to the open side and remains on screen.
- Added keyboard-focus support while preserving click-to-pin PART INSPECT details and mobile node inspection.
- Visually verified the Grip speed guide card in the live Level 3 workspace.

## 2026-07-20 - Inquiry-led campaign learning (complete)

- Removed the forced one-part-at-a-time guided build from Levels 1 and 2; all mission-relevant parts are now available from the start.
- Replaced step copying with an Engineering Brief for every mission: situation, reasoning question, pre-run prediction, and a three-level optional hint ladder.
- Hints progress from control concept to relevant parts to exact wiring only when the player asks for help.
- Added mission-specific causal explanations for ignition, feedback speed control, localization and Pure Pursuit, curvature-aware speed planning, and LiDAR Follow-the-Gap.
- Added post-success WHY IT WORKED takeaways so the completed behavior is tied back to the algorithm.
- Updated First Ignition HUD to measure motion rather than a lap and reveal progression only after motion is observed.
- Verified Level 1 exposes all six candidate parts immediately, and verified the full First Ignition discovery, motion observation, takeaway, and three-stage hint flow.

## 2026-07-20 - Readability and open-question learning pass (complete)

- Removed the multiple-choice `PREDICT BEFORE YOU RUN` quiz from every Engineering Brief.
- Kept the open-ended `THINK` prompt so players form their own control hypothesis, with three optional progressive hints when they need support.
- Increased mission copy, status labels, controls, HUD, result text, Parts Bay labels, and contextual guide typography across the workspace.
- Enlarged graph nodes, signal rows, parameter inputs, and connection ports while preserving row-to-port alignment.
- Increased automatic node spacing and the graph's minimum zoom so larger circuits stay readable instead of shrinking into an overview.
- Expanded the default graph workspace split and Parts Bay touch targets to make building easier.
- Visually checked Level 1 and the 16-node Level 3 circuit: the quiz is gone, the open question remains, and enlarged nodes and ports stay aligned.

## 2026-07-20 - Context-aware Const output labels (complete)

- Replaced the ambiguous visible `v` label on Const blocks with the clearer `value` label.
- When a Const is connected to one input, its output now shows the signal destination, such as `value → Ld` or `value → gain`.
- Kept the internal `v` port key unchanged so existing graphs, validation, and simulation behavior remain compatible.
- Confirmed the Level 3 preset renders both `value → Ld` and `value → gain` correctly.

## 2026-07-20 - Drag-to-trash block deletion (complete)

- Added a persistent trash target at the bottom of the graph workspace with a clear `여기로 끌어 삭제` label.
- The trash target becomes red and expands while a block is dragged over it, then removes the block and all attached links on drop.
- Captured the pre-drag graph state so `UNDO` restores a deleted block to its original position together with its links.
- Explicitly enabled both `Delete` and `Backspace` as keyboard alternatives.
- Updated the Parts Bay instruction to teach the drag-to-trash gesture.
- Verified in Level 1 that dragging Const to the trash changes the node count from 1 to 0 and that `UNDO` restores it at the original position.
