// Physics v2 Phase 1 tests. v2 is opt-in via world.physicsVersion=2; v1 stays frozen.
import { DT, G, PHYSICS_LATEST, buildWorld, initCar, nearestIndex, castScan, pointInBox, stepDynamics, stepDynamicsV2, stepVehicle, makeSim, tick, runFor } from '../src/index.ts';
import { PURSUIT } from '../src/graph/presets.ts';
import type { CarState, Control, Height, World } from '../src/index.ts';

let failed = 0;
function ok(cond: boolean, msg: string) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; }
function near(actual: number, expected: number, msg: string, eps = 1e-9) { ok(Math.abs(actual - expected) <= eps, `${msg} (${actual})`); }

const flatH: Height = { at:()=>0, grad:()=>[0,0], zmin:0, zmax:0, zlo:0, zhi:0 };
const gradH = (gx:number,gy:number):Height => ({ at:()=>0, grad:()=>[gx,gy], zmin:0, zmax:0, zlo:0, zhi:0 });
const flatV2: World = { ...buildWorld({ physicsVersion:2 }), height:flatH };
function stepFor(car: CarState, u: Control, steps: number, world: World, step=stepDynamicsV2) { let s=car; for(let i=0;i<steps;i++) s=step(s,u,world,DT); return s; }

// ---- version selection / propagation ----
ok(PHYSICS_LATEST === 2, 'PHYSICS_LATEST is 2');
ok(buildWorld({ physicsVersion:2 }).physicsVersion === 2, 'buildWorld selects physics v2');
ok((buildWorld().physicsVersion ?? 1) === 1, 'default world stays physics v1');
ok(makeSim(flatV2, PURSUIT).physicsVersion === 2, 'sim carries v2 when selected');
ok(stepVehicle === stepVehicle && stepVehicle(initCar(flatV2),{steer:0,throttle:1},flatV2,DT).groundSpeed !== undefined, 'v2 dispatch produces ground-speed');
ok(stepVehicle(initCar({...buildWorld(),height:flatH}),{steer:0,throttle:1},{...buildWorld(),height:flatH},DT).x === stepDynamics(initCar({...buildWorld(),height:flatH}),{steer:0,throttle:1},{...buildWorld(),height:flatH},DT).x, 'dispatcher runs v1 for a v1 world');

// ---- longitudinal friction limit (coast-difference isolates the tire force) ----
const tireLong = (car:CarState, thr:number, world:World) => (stepDynamicsV2(car,{steer:0,throttle:thr},world,DT).vx - stepDynamicsV2(car,{steer:0,throttle:0},world,DT).vx)/DT;
const asC = { ...initCar(flatV2), vx:20, v:20 };
ok(Math.abs(tireLong(asC,-1,flatV2)) <= flatV2.mu*G + 1e-6, 'asphalt braking stays within mu*g');
const asD = { ...initCar(flatV2), vx:5, v:5 };
ok(Math.abs(tireLong(asD,1,flatV2)) <= flatV2.mu*G + 1e-6, 'asphalt acceleration stays within mu*g');
// grass: place the car off-track so mu = muGrass
const gOff = (()=>{ const c=initCar(flatV2); return { ...c, x:c.x+50, y:c.y+50, vx:5, v:5 }; })();
ok(nearestIndex(flatV2.track, gOff.x, gOff.y).dist > flatV2.track.half, 'grass probe is off-track');
ok(Math.abs(tireLong(gOff,1,flatV2)) <= flatV2.muGrass*G + 1e-6, 'grass acceleration stays within muGrass*g');
ok(Math.abs(tireLong(gOff,-1,flatV2)) <= flatV2.muGrass*G + 1e-6, 'grass braking stays within muGrass*g');

// ---- combined slip: longitudinal use reduces available lateral force under saturation ----
const csBase = { ...initCar(flatV2), vx:15, v:15 };
const rCoast = stepDynamicsV2(csBase,{steer:0.4,throttle:0},flatV2,DT).r;
const rDrive = stepDynamicsV2(csBase,{steer:0.4,throttle:1},flatV2,DT).r;
ok(Math.abs(rDrive) < Math.abs(rCoast), 'combined slip: adding throttle reduces cornering (lateral) response');

// ---- terrain gravity: accelerate only downhill, with consistent normalized sign ----
const dnW = {...flatV2, height:gradH(-0.2,0)};
const dnGrade = stepDynamicsV2({ ...initCar(dnW), yaw:0, vx:0, v:0 }, {steer:0,throttle:0}, dnW, DT);
ok(dnGrade.vx > 0, 'longitudinal downhill grade accelerates the car forward');
const upW = {...flatV2, height:gradH(0.2,0)};
const upGrade = stepDynamicsV2({ ...initCar(upW), yaw:0, vx:5, v:5 }, {steer:0,throttle:0}, upW, DT);
ok(upGrade.vx < 5, 'longitudinal uphill grade decelerates the car');
const bankW = {...flatV2, height:gradH(0,0.1)};
const bankV2 = stepDynamicsV2({ ...initCar(bankW), yaw:0, vx:5, v:5 }, {steer:0,throttle:0}, bankW, DT);
ok(bankV2.vy < 0, 'cross-slope accelerates downhill (v2 sign corrected)');
const bankV1 = stepDynamics({ ...initCar(bankW), yaw:0, vx:5, v:5 }, {steer:0,throttle:0}, bankW, DT);
near(bankV2.vy, -bankV1.vy, 'v2 bank response is the corrected negation of v1', 1e-12);

// ---- post-integration observations match the new pose (not one tick stale) ----
const drivenV2 = stepFor({ ...initCar(flatV2 as any) }, {steer:0.2,throttle:1}, 90, {...buildWorld({physicsVersion:2})});
{ const w = buildWorld({physicsVersion:2}); const n = nearestIndex(w.track, drivenV2.x, drivenV2.y, drivenV2.idx);
  ok(n.i === drivenV2.idx, 'post-step nearest index matches integrated position');
  ok((n.dist <= w.track.half) === drivenV2.onTrack, 'post-step on-track matches integrated position');
  const gr = w.height.grad(drivenV2.x, drivenV2.y), ch=Math.cos(drivenV2.yaw), sh=Math.sin(drivenV2.yaw);
  near(drivenV2.grade, gr[0]*ch+gr[1]*sh, 'post-step grade matches integrated position', 1e-9); }

// ---- longitudinal speed vs ground-speed magnitude are distinct signals ----
const slip = stepFor({ ...initCar(flatV2), vx:14, v:14 }, {steer:0.45,throttle:0.2}, 40, flatV2);
near(slip.groundSpeed!, Math.hypot(slip.vx, slip.vy), 'ground speed equals velocity magnitude');
ok(Math.abs(slip.vy) > 1e-3 && slip.groundSpeed! > slip.v, 'under sideslip ground speed exceeds longitudinal speed');

// ---- determinism ----
const dA = stepFor({ ...initCar(flatV2), vx:12, v:12 }, {steer:-0.15,throttle:0.45}, 240, flatV2);
const dB = stepFor({ ...initCar(flatV2), vx:12, v:12 }, {steer:-0.15,throttle:0.45}, 240, flatV2);
ok(JSON.stringify(dA) === JSON.stringify(dB), 'identical inputs and world produce identical v2 state');

// ---- timestep convergence: 120 Hz within tolerance of a 240 Hz reference ----
const conv = (dt:number) => { let c={ ...initCar(flatV2), vx:8, v:8 }; const n=Math.round(5/dt); for(let i=0;i<n;i++)c=stepDynamicsV2(c,{steer:0.15,throttle:0.4},flatV2,dt); return c; };
const c120=conv(1/120), c240=conv(1/240);
ok(Math.hypot(c120.x-c240.x, c120.y-c240.y) < 0.5, '120 Hz stays within 0.5 m of the 240 Hz reference over 5 s');

// ---- v1 PURSUIT lap stays exactly the frozen value; v2 baseline is separate ----
ok(runFor(buildWorld(), PURSUIT, 1, 70).bestClean === 21.083333333332778, 'physics v1 PURSUIT lap remains exact');
const v2run = runFor(buildWorld({physicsVersion:2}), PURSUIT, 1, 70);
ok(v2run.physicsVersion === 2, 'v2 run summary carries physics version 2');
ok(v2run.bestClean === null, 'v1-tuned PURSUIT has no clean v2 lap (exceeds stricter v2 grip)');
ok(v2run.laps.length === 1 && v2run.laps[0].dirty === true && v2run.laps[0].t.toFixed(4) === '21.6167', 'v2 PURSUIT baseline lap is a deterministic 21.6167 s dirty lap');
const v2runB = runFor(buildWorld({physicsVersion:2}), PURSUIT, 1, 70);
ok(JSON.stringify(v2run.laps) === JSON.stringify(v2runB.laps), 'v2 PURSUIT run is deterministic');

// ---- v2 LiDAR uses an oriented box (v1 keeps the circumscribed circle) ----
{ const box = { x:0, y:0, yaw:0, hl:4, hw:0.5 };
  const circleR = Math.hypot(4, 0.5), px = 3.5, py = 1.5;
  ok(px*px + py*py <= circleR*circleR, 'a corner point sits inside the circumscribed circle');
  ok(!pointInBox(px, py, box), 'v2 oriented box excludes the corner point the circle would falsely hit'); }
{ const w1 = { ...buildWorld(), height:flatH }, w2 = { ...buildWorld({ physicsVersion:2 }), height:flatH };
  const c = initCar(w1), t = w1.track.tan[0];
  const bar:any = { id:'bar', kind:'static', pose:{ x:c.x+t[0]*8, y:c.y+t[1]*8, yaw:Math.atan2(t[1],t[0])+0.6 },
    velocity:{x:0,y:0}, yawRate:0, shape:{ type:'box', radius:0, length:10, width:0.8 }, confidence:1 };
  const r1 = castScan(c, w1, 21, 2, [bar]).ranges, r2 = castScan(c, w2, 21, 2, [bar]).ranges;
  ok(r2.every((v,i)=>v >= r1[i]-1e-9), 'v2 LiDAR never reports an obstacle nearer than v1 (box is inside the circle)');
  ok(r2.some((v,i)=>v > r1[i]+1e-9), 'v2 LiDAR sees past circumscribed-circle false hits on grazing beams'); }

console.log(failed === 0 ? '\nALL PASS - physics v2 Phase 1 forces, slopes, observations verified' : `\n${failed} FAILED`);
if (failed) process.exit(1);
