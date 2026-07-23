# Vehicle physics audit v1

## Decision

The current simulator is suitable for deterministic control-graph learning and
lap-time comparison. It is not yet suitable as a high-fidelity vehicle dynamics
reference, for contact-heavy PvP, or for sim-to-real RL/MPC claims.

Do not silently change the shipped model. Preserve it as `physicsVersion: 1`, add
regression tests, and introduce corrected behavior as a versioned migration. A
physics change affects lap times, medals, ghosts, replays, and leaderboard fairness.

## Current model

- Dynamic single-track bicycle model at a fixed 120 Hz step.
- Steering-rate actuator limit and direct drive/brake longitudinal force.
- Linear front/rear cornering stiffness with a residual lateral friction limit.
- Low-speed blend to a kinematic bicycle model.
- Height-field grade and bank gravity, aerodynamic drag, and rolling resistance.
- Deterministic pure stepping shared by gameplay and rollout evaluation.
- Contact detection marks a run dirty but does not resolve penetration or impulse.
- AI opponents follow the centerline kinematically rather than using player physics.

## Measured checks

Temporary offscreen probes used the production core model without changing source.

| Check | Result | Interpretation |
| --- | ---: | --- |
| Full brake from 20 m/s on asphalt | -17.540 m/s2 | Exceeds `mu * g = 9.810 m/s2` before considering drag |
| Full drive on grass | 8.585 m/s2 | Exceeds `muGrass * g = 4.415 m/s2` |
| 10% cross-slope, uphill +y | `vy = +0.008134 m/s` after one tick | Bank gravity sign accelerates uphill |
| Current track maximum height gradient | 0.388 | Terrain effects are material, not negligible |
| Maximum sampled longitudinal grade | about 16.0 degrees | Grade behavior needs a regression test |
| Maximum sampled lateral bank | about 20.7 degrees | Bank sign error is visible in normal tracks |
| 60 Hz vs 240 Hz after 5 s | 0.091 m position difference | Acceptable convergence for gameplay |
| 120 Hz vs 240 Hz after 5 s | 0.030 m position difference | Current fixed step is adequate |
| `vx=15`, `vy=6` speed signal | 14.978 vs 16.105 m/s magnitude | UI/control speed under-reports sideslip |

## Findings

### P0: correctness and competition blockers

1. Longitudinal force is not included in the tire friction budget. `FXDRIVE` and
   `FXBRAKE` are applied directly, while only lateral force is clamped to the
   remaining friction circle. Braking and low-friction acceleration can exceed grip.
2. Lateral gravity uses the height-gradient bank component with the wrong sign.
   A vehicle on a cross-slope accelerates uphill. Grade and bank should both use a
   consistently normalized road tangent frame.
3. Collision is detection-only. It marks a lap dirty but applies no separation,
   impulse, velocity change, or damage, so vehicles and obstacles can pass through.
4. AI racers are kinematic track followers. They do not obey the same steering,
   grip, acceleration, or collision rules as the player, which is unsuitable for
   fair Head-to-Head and Grid Start competition.
5. Lap completion relies on nearest-centerline index wrap. It needs ordered sectors
   and checkpoints to prevent shortcut finishes and ambiguous progress jumps.

### P1: observable model gaps

6. Returned nearest index, on-track state, and terrain data are derived from the
   pre-integration position, so they are one simulation tick stale.
7. The public speed signal is longitudinal body velocity `vx`, not ground-speed
   magnitude. Both signals should be explicit so controllers and visualizations do
   not silently disagree during sideslip.
8. Scene boxes are represented by circumscribed circles for LiDAR and collision.
   This reports obstacles too early near corners and cannot model oriented contact.
9. The hard-clamped linear tire and constant-force drivetrain are appropriate game
   abstractions, but omit load sensitivity, combined-slip shape, power limitation,
   gear behavior, and lateral load transfer.
10. Terrain affects planar acceleration only. There is no pitch, roll, suspension,
    wheel contact, or vertical load transient despite steep generated banking.

## What should remain

- Fixed-step deterministic simulation with no wall-clock or RNG dependency.
- Pure `stepDynamics` API shared by gameplay, tests, and rollout evaluation.
- 120 Hz simulation rate; measured integration convergence is adequate.
- Steering-rate limitation and low-speed kinematic blending.
- A deliberately approachable model rather than an opaque full vehicle simulator.

## Versioned migration

### Phase 0: freeze and characterize v1

Implementation status: **complete (2026-07-23)**.

- `PHYSICS_VERSION = 1` is exported by core and carried by simulation state, lap
  records, run summaries, local bests, online submissions, match tickets, and
  leaderboard filtering.
- `packages/core/test/physics.ts` locks throttle, brake, coastdown, cornering,
  bank, deterministic state, version propagation, and the exact PURSUIT lap.
- Future ghost/replay records are required to carry the same version contract.

- Add `physicsVersion` to run, replay, ghost, and leaderboard records.
- Lock golden tests for acceleration, braking, coastdown, constant-radius steering,
  grade, bank, low-speed transition, timestep convergence, and current best laps.
- Keep existing records and missions on v1 until v2 tuning is complete.

### Phase 1: correct core forces

Implementation status: **complete (2026-07-23)**.

- Clamp each axle longitudinal force by `mu * Fz`, then compute lateral capacity
  from the remaining combined-slip budget.
- Correct bank gravity direction and normalize grade/bank using the road tangent.
- Recompute track and terrain observations after integration.
- Expose `longitudinalSpeed` and `groundSpeed` as separate typed signals.

Delivered as an **opt-in** model, selected by `world.physicsVersion` (`buildWorld({ physicsVersion: 2 })`
and `PHYSICS_LATEST = 2`). v1 `stepDynamics` is byte-unchanged and remains the default; a `stepVehicle`
dispatcher routes the sim, `sim.predict`, and trajectory rollouts to the chosen model. `PHYSICS_VERSION`
(the frozen v1 contract) stays `1` and every run/lap/summary still records the version actually used.

Measured v2 vs v1 on the same probes (`packages/core/test/physics-v2.ts`):

| Check | v1 | v2 | v2 limit |
| --- | ---: | ---: | ---: |
| Asphalt full-brake tire decel (20 m/s) | -17.540 m/s2 | -6.766 m/s2 | `mu*g = 9.810` |
| Grass full-drive tire accel | 8.585 m/s2 | 4.414 m/s2 | `muGrass*g = 4.415` |
| 10% cross-slope, uphill +y | `vy = +0.008134` (uphill) | `vy = -0.008134` (downhill) | sign corrected |
| Longitudinal downhill grade from rest | n/a | `vx > 0` | accelerates downhill |
| Post-step nearest index / on-track / grade | one tick stale | matches integrated pose | — |
| Sideslip speed signals | `speed = vx` only | `v = vx`, `groundSpeed = |v|` distinct | — |
| 120 Hz vs 240 Hz over 5 s (steer+throttle) | — | 0.263 m | within 0.5 m tolerance |

Combined slip is verified behaviorally: adding throttle under a saturating steer reduces the cornering
(yaw) response, because the front longitudinal force consumes part of the axle friction budget.

### Baseline lap times (never compared across versions)

- **physics v1 PURSUIT**: `bestClean = 21.083333333332778 s` (frozen contract, still exact).
- **physics v2 PURSUIT**: the v1-tuned Pure Pursuit exceeds v2's stricter combined-slip grip and has
  **no clean lap** (`bestClean = null`); its single lap is a deterministic `21.6167 s` **dirty** lap.
  A v2-tuned controller and v2-specific medals/leaderboards are future work (do not compare with v1).

### Phase 2: make racing fair

Implementation status: **collision response complete (2026-07-23)**; opponent dynamics and
checkpoint validation still pending.

- [x] Oriented-box narrow-phase collision (SAT), penetration correction, and a deterministic
  inelastic impulse — added in `packages/core/src/sim/collision.ts`, applied by the runner only
  when `world.physicsVersion === 2`. v1 stays detection-only (circumscribed-circle dirty marking,
  unchanged). The car is separated out of any penetrating oriented box and its into-obstacle
  velocity component is removed; opponents are still kinematic so they act as immovable here.
  Verified by `packages/core/test/collision.ts`: v2 car stops at a wall without penetrating and the
  same setup on v1 passes straight through; response is deterministic. The v2 PURSUIT baseline is
  unchanged (no objects on that track).
- [ ] Run opponents through the same `stepVehicle` model and command interface as players.
- [ ] Replace index-wrap finishes with ordered sectors, checkpoints, and authoritative
  race-state validation.

### Phase 3: optional fidelity

- Calibrate a Fiala or Pacejka-lite tire curve and lateral load sensitivity.
- Add a speed/power-limited drivetrain and configurable braking balance.
- Add roll/pitch/vertical dynamics only as an advanced physics mode; keep the basic
  course on an inspectable planar model.

## Acceptance gates for physics v2

- Deterministic replay equality on repeated runs and supported platforms.
- Force-limit tests pass on asphalt and grass for drive, brake, and combined slip.
- Grade and bank tests accelerate only downhill with analytically expected signs.
- 120 Hz remains within an agreed tolerance of a 240 Hz reference trajectory.
- Player and AI vehicles share identical dynamics and collision rules in PvP modes.
- Mission medals, presets, ghosts, and leaderboard seasons are retuned/versioned;
  no v1 and v2 lap times are compared in the same ranking.
