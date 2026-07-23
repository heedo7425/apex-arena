// Golden characterization for physics v1. Intentional model corrections require a version bump.
import { DT, PHYSICS_VERSION, buildWorld, initCar, makeSim, runFor, stepDynamics } from '../src/index.ts';
import { PURSUIT } from '../src/graph/presets.ts';
import type { CarState, Control, Height, World } from '../src/index.ts';

let failed = 0;
function ok(cond: boolean, msg: string) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; }
function near(actual: number, expected: number, msg: string, eps = 1e-9) {
  ok(Math.abs(actual - expected) <= eps, `${msg} (${actual})`);
}

const flatHeight: Height = { at:()=>0, grad:()=>[0,0], zmin:0, zmax:0, zlo:0, zhi:0 };
const flatWorld: World = { ...buildWorld(), height:flatHeight };

function stepFor(car: CarState, control: Control, steps: number, world = flatWorld) {
  let state = car;
  for (let i = 0; i < steps; i++) state = stepDynamics(state, control, world, DT);
  return state;
}

ok(PHYSICS_VERSION === 1, 'physics contract is version 1');
near(DT, 1/120, 'fixed physics step is 120 Hz');
ok(makeSim(flatWorld, PURSUIT).physicsVersion === PHYSICS_VERSION, 'simulation carries physics version');

const initial = initCar(flatWorld);
const accel = stepFor(initial, { steer:0, throttle:1 }, 120);
near(accel.vx, 8.587235097406179, 'one-second full-throttle speed');
near(accel.x, 24.010831170749075, 'one-second full-throttle x');
near(accel.y, 40.71480794207633, 'one-second full-throttle y');

const brake = stepDynamics({ ...initial, vx:20, v:20 }, { steer:0, throttle:-1 }, flatWorld, DT);
near(brake.vx, 19.853833333333334, 'single-step full-brake speed');

const coast = stepFor({ ...initial, vx:20, v:20 }, { steer:0, throttle:0 }, 120);
near(coast.vx, 16.27206745590002, 'one-second coastdown speed');

const turn = stepFor({ ...initial, vx:12, v:12 }, { steer:0.2, throttle:0.3 }, 240);
near(turn.vx, 13.23613452062719, 'two-second corner speed');
near(turn.yaw, -0.8983616786268839, 'two-second corner yaw');
near(turn.r, 0.48327113210322054, 'two-second corner yaw rate');

const bankWorld: World = { ...flatWorld, height:{ ...flatHeight, grad:()=>[0,0.1] } };
const bank = stepDynamics({ ...initCar(bankWorld), yaw:0, vx:5, v:5 }, { steer:0, throttle:0 }, bankWorld, DT);
near(bank.vy, 0.008134429029966663, 'v1 cross-slope response');
ok(bank.vy > 0, 'legacy uphill bank direction is characterized for v2 correction');

const deterministicA = stepFor({ ...initial, vx:12, v:12 }, { steer:-0.15, throttle:0.45 }, 240);
const deterministicB = stepFor({ ...initial, vx:12, v:12 }, { steer:-0.15, throttle:0.45 }, 240);
ok(JSON.stringify(deterministicA) === JSON.stringify(deterministicB), 'identical inputs produce identical state');

const run = runFor(buildWorld(), PURSUIT, 1, 70);
ok(run.physicsVersion === PHYSICS_VERSION, 'run summary carries physics version');
ok(run.laps.length > 0 && run.laps.every(lap=>lap.physicsVersion===PHYSICS_VERSION), 'lap records carry physics version');
ok(run.bestClean === 21.083333333332778, 'physics v1 PURSUIT lap remains exact');

console.log(failed === 0 ? '\nALL PASS - physics v1 is characterized and versioned' : `\n${failed} FAILED`);
if (failed) process.exit(1);
