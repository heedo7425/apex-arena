// Headless verification of @apex/core: graphs drive the car, deterministically.
import { buildWorld } from '../src/sim/world.ts';
import { runFor, medalFor } from '../src/sim/runner.ts';
import { FTG, PURSUIT } from '../src/graph/presets.ts';

let failed = 0;
function ok(cond: boolean, msg: string) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; }

const world = buildWorld();

// 1) FTG graph drives the car and completes clean laps
const ftg = runFor(world, FTG, 1, 70);
console.log('FTG:', 'laps=' + ftg.laps.length, 'bestClean=' + (ftg.bestClean?.toFixed(2) ?? '--'), 'maxV=' + ftg.maxV.toFixed(1), 'medal=' + medalFor(ftg.bestClean));
ok(!ftg.nan, 'FTG no NaN');
ok(ftg.bestClean !== null && ftg.bestClean < 25, 'FTG completes a clean lap under 25s');

// 2) Pure Pursuit graph drives too
const pur = runFor(world, PURSUIT, 1, 70);
console.log('PURSUIT:', 'laps=' + pur.laps.length, 'bestClean=' + (pur.bestClean?.toFixed(2) ?? '--'), 'maxV=' + pur.maxV.toFixed(1), 'medal=' + medalFor(pur.bestClean));
ok(!pur.nan, 'PURSUIT no NaN');
ok(pur.bestClean !== null, 'PURSUIT completes a clean lap');

// 3) Determinism: same seed → identical result (essential for leaderboards/replay)
const a = runFor(world, FTG, 42, 40);
const b = runFor(world, FTG, 42, 40);
ok(a.bestClean === b.bestClean && a.laps.length === b.laps.length, 'deterministic: same seed → identical laps');

// 4) Model-as-node hook wired: sim.predict exists in registry (for MPPI/MPC later)
import { NT } from '../src/graph/registry.ts';
ok(!!NT['sim.predict'] && NT['sim.predict'].kind === 'builtin', 'hook: sim.predict (model-as-node) present');
ok(!!NT['rng.uniform'] && !!NT['array.map'], 'hooks: rng + higher-order Map present');


// 5) Graph validation prevents invalid editor programs before simulation starts.
import { makeGraph } from '../src/graph/engine.ts';
import { validateGraph } from '../src/graph/validate.ts';

const validOutputs = makeGraph({
  steer:{ type:'sink.steer', in:{ x:['lit', 0] } },
  throttle:{ type:'sink.throttle', in:{ x:['lit', 0] } },
});
ok(validateGraph(validOutputs, NT, { requireOutputs:true }).length === 0, 'validator accepts a runnable output graph');

const typeMismatch = makeGraph({
  pose:{ type:'src.pose' },
  throttle:{ type:'sink.throttle', in:{ x:['n', 'pose', 'pose'] } },
});
ok(validateGraph(typeMismatch, NT).some(i => i.code === 'type-mismatch'), 'validator rejects incompatible port types');

const cycle = makeGraph({
  a:{ type:'add', in:{ a:['n', 'b', 'v'] } },
  b:{ type:'add', in:{ a:['n', 'a', 'v'] } },
});
ok(validateGraph(cycle, NT).some(i => i.code === 'cycle'), 'validator rejects graph cycles');

const missingOutput = makeGraph({ steer:{ type:'sink.steer', in:{ x:['lit', 0] } } });
ok(validateGraph(missingOutput, NT, { requireOutputs:true }).some(i => i.code === 'missing-output'), 'validator requires both control outputs');

const unwiredInput = makeGraph({
  add:{ type:'add', in:{ a:['lit', 1] } },
  steer:{ type:'sink.steer', in:{ x:['n', 'add', 'v'] } },
  throttle:{ type:'sink.throttle', in:{ x:['lit', 0] } },
});
ok(validateGraph(unwiredInput, NT, { requireOutputs:true }).some(i => i.code === 'unwired-input'), 'validator rejects incomplete active paths');

const throttleOnly = makeGraph({
  power:{ type:'const', params:{ value:1 } },
  throttle:{ type:'sink.throttle', in:{ x:['n', 'power', 'v'] } },
});
ok(validateGraph(throttleOnly, NT, { requiredOutputs:['sink.throttle'] }).length === 0, 'validator supports mission-specific output requirements');

const throttleIncomplete = makeGraph({
  error:{ type:'sub', in:{ a:['lit', 1] } },
  throttle:{ type:'sink.throttle', in:{ x:['n', 'error', 'v'] } },
});
ok(validateGraph(throttleIncomplete, NT, { requiredOutputs:['sink.throttle'] }).some(i => i.code === 'unwired-input'), 'mission-specific validation still rejects incomplete active paths');

console.log(failed === 0 ? '\n✅ ALL PASS — core drives deterministically' : '\n❌ ' + failed + ' FAILED');
if (failed) process.exit(1);
