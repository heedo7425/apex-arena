# Claude handoff: physics v1 freeze to physics v2

## Repository state

- Remote repository: `/home/hmcl/apex-arena`
- Branch: `main`
- Phase 0 implementation commit: `7b6bf96 feat: freeze physics v1 contract`
- Audit commit: `0425350 docs: audit vehicle physics model`
- Live v1 bundle at handoff: `index-D_4qADz0.js`
- Expected clean status: `main...origin/main`

Read these files before changing anything:

1. `CLAUDE.md`
2. `design/physics-audit-v1.md`
3. `design/race-modes-v1.md`
4. `packages/core/test/physics.ts`
5. The latest two sections of `codex_edit.md`

## What Codex completed

- Audited the planar single-track model and measured its current behavior.
- Exported `PHYSICS_VERSION = 1` from core.
- Added physics version tags to simulation state, lap results, run summaries,
  local best records, run submissions, match tickets, and leaderboard filtering.
- Added golden v1 tests for acceleration, braking, coastdown, cornering, bank,
  determinism, version propagation, and the exact PURSUIT lap.
- Preserved PURSUIT `bestClean === 21.083333333332778`.
- Updated and deployed the committed `app/` build.

## Known v1 limitations

1. Longitudinal tire force is not clamped by `mu * Fz`; drive and braking can
   exceed the friction budget.
2. Cross-slope gravity has the wrong sign and accelerates the car uphill.
3. Track index, on-track, and terrain observations are returned one tick stale.
4. Public speed is longitudinal `vx`, not ground-speed magnitude.
5. Collision is detection-only and AI opponents use kinematic track following.

The first three are the next physics v2 correctness scope. Collision, equal AI
dynamics, and checkpoint race validation are later phases.

## Non-negotiable migration rules

- Do not overwrite or silently change physics v1.
- Do not edit v1 golden expected values merely to make a changed model pass.
- Keep v1 selectable and keep all existing v1 tests and the exact PURSUIT lap.
- Physics v2 must be selected explicitly by a versioned world/simulation contract.
- Never compare v1 and v2 lap times in one local or online leaderboard.
- No RNG or wall-clock dependency; repeated inputs must remain bitwise deterministic.
- Do not retune missions, tracks, medals, or the L0/L1 block palette in this pass.
- Run all validation offscreen. Never open a visible browser on the remote machine.
- Record every change in `codex_edit.md`, rebuild `app/`, commit, and push `main`.

## Recommended next implementation

1. Introduce an explicit physics model/version selector while retaining the v1
   code path unchanged.
2. For v2, clamp front/rear longitudinal force by each axle's `mu * Fz`, then
   derive lateral capacity from the remaining combined-slip budget.
3. Correct cross-slope gravity direction and use a consistently normalized road
   tangent for grade and bank.
4. Recompute nearest index, on-track status, height, and grade from the integrated
   post-step pose.
5. Add separate longitudinal-speed and ground-speed observations without changing
   the meaning of the existing v1 speed signal.
6. Add v2 unit tests for asphalt/grass drive and brake limits, combined slip,
   downhill bank direction, post-step observations, timestep convergence, and
   repeated-run determinism.
7. Produce a v2 baseline lap report, but do not replace v1 medals or leaderboard.

## Required verification

```bash
git status --short --branch
git log -3 --oneline
pnpm --filter @apex/core test
pnpm --filter @apex/web exec tsc --noEmit
pnpm --filter @apex/web build
git diff --check
```

After push, poll GitHub Pages until its JS hash matches the new local `app/index.html`.

## Prompt to give Claude

```text
Work only on the remote repository /home/hmcl/apex-arena. Start by reading
CLAUDE.md, design/claude-handoff-physics-v2.md, design/physics-audit-v1.md,
design/race-modes-v1.md, packages/core/test/physics.ts, and the latest entries in
codex_edit.md. Confirm that commit 7b6bf96 is present and the worktree is clean.

Continue from the completed physics v1 freeze into physics v2 Phase 1. Preserve the
v1 code path, all v1 golden tests, and the exact PURSUIT v1 bestClean value
21.083333333332778. Add an explicit version/model selector rather than changing v1
in place. In the v2 path, enforce per-axle longitudinal grip before computing
remaining lateral capacity, correct the cross-slope gravity sign with normalized
terrain coordinates, recompute track/terrain observations after integration, and
expose longitudinal speed separately from ground-speed magnitude. Add focused v2
tests for asphalt/grass acceleration and braking limits, combined slip, bank/grade
direction, post-step observations, timestep convergence, and determinism.

Do not implement collision response, AI dynamics migration, checkpoint racing,
mission retuning, or palette changes in this pass. Do not mix v1 and v2 records.
Run pnpm --filter @apex/core test, web TypeScript checking, and the production build.
All browser checks must be headless/offscreen. Update codex_edit.md and the physics
audit with results, rebuild committed app/, commit without backticks in the commit
message, push origin main, and confirm the live bundle hash.
```
