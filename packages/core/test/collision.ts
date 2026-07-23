// Physics v2 Phase 2: oriented-box collision response. v1 stays detection-only.
import { DT, buildWorld, initCar, makeSim, tick, collideBoxes, boxForObject, carBoxOf, resolvePair, CAR_HL, CAR_HW } from '../src/index.ts';
import { makeGraph } from '../src/graph/engine.ts';
import type { SceneObject, World } from '../src/index.ts';

let failed = 0;
function ok(cond: boolean, msg: string) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; }
function near(a: number, b: number, msg: string, eps = 1e-9) { ok(Math.abs(a-b) <= eps, `${msg} (${a})`); }

// ---- SAT unit checks ----
{ const hit = collideBoxes({x:0,y:0,yaw:0,hl:2,hw:1}, {x:2.5,y:0,yaw:0,hl:1,hw:1});
  ok(!!hit, 'overlapping axis-aligned boxes collide');
  near(hit!.depth, 0.5, 'penetration depth is exact', 1e-9);
  ok(hit!.normal[0] < -0.99 && Math.abs(hit!.normal[1]) < 1e-9, 'push-out normal points away from the obstacle'); }
ok(collideBoxes({x:0,y:0,yaw:0,hl:2,hw:1}, {x:4,y:0,yaw:0,hl:1,hw:1}) === null, 'clearly separated boxes do not collide');
ok(!!collideBoxes({x:0,y:0,yaw:0,hl:2,hw:0.5}, {x:2.2,y:0,yaw:Math.PI/4,hl:1,hw:1}), 'oriented (rotated) box overlap is detected');

// ---- 2-body equal-mass impulse (physical opponents) ----
{ const w = buildWorld();
  const a = { ...initCar(w), x:0, y:0, yaw:0, vx:5, v:5 };            // moving +x toward b
  const b = { ...initCar(w), x:2, y:0, yaw:Math.PI, vx:5, v:5 };     // moving -x toward a (head-on)
  const hit = resolvePair(a, carBoxOf(a), b, carBoxOf(b));
  ok(hit, 'overlapping cars trigger a 2-body response');
  ok(a.x < 0 && b.x > 2, 'both cars are pushed apart (split penetration)');
  ok(collideBoxes(carBoxOf(a), carBoxOf(b)) === null, 'cars are separated after resolution');
  ok(Math.abs(a.vx) < 1e-9 && Math.abs(b.vx) < 1e-9, 'equal head-on closing speed cancels for both (momentum-consistent)');
  // determinism
  const a2 = { ...initCar(w), x:0, y:0, yaw:0, vx:5, v:5 }, b2 = { ...initCar(w), x:2, y:0, yaw:Math.PI, vx:5, v:5 };
  resolvePair(a2, carBoxOf(a2), b2, carBoxOf(b2));
  ok(a2.x===a.x && a2.vx===a.vx && b2.x===b.x, '2-body impulse is deterministic'); }

// straight-drive world (flat height, so the car travels straight along its heading)
// with a static wall placed 9 m ahead. Progress is measured along the heading axis.
const flatH = { at:()=>0, grad:()=>[0,0] as [number,number], zmin:0, zmax:0, zlo:0, zhi:0 };
const base = buildWorld();
const p0 = base.track.pts[0], t0 = base.track.tan[0], wallProg = 9;
const wall: SceneObject = { id:'wall', kind:'static',
  pose:{ x: p0[0] + t0[0]*wallProg, y: p0[1] + t0[1]*wallProg, yaw: Math.atan2(t0[1], t0[0]) },
  velocity:{x:0,y:0}, yawRate:0, shape:{ type:'box', radius:0, length:2.4, width:6 }, confidence:1 } as any;
const drive = makeGraph({ c:{ type:'const', params:{ value:1 } }, t:{ type:'sink.throttle', in:{ x:['n','c','v'] } } });
const progress = (c:{x:number;y:number}) => (c.x-p0[0])*t0[0] + (c.y-p0[1])*t0[1];

function runInto(version:1|2){
  const w: World = { ...buildWorld({ physicsVersion:version }), height:flatH, objects:[wall] };
  const s = makeSim(w, drive, 1);
  let maxDepth = 0;
  for (let i=0;i<300;i++){ tick(s); const h = collideBoxes({x:s.car.x,y:s.car.y,yaw:s.car.yaw,hl:CAR_HL,hw:CAR_HW}, boxForObject(wall)); if(h && h.depth>maxDepth) maxDepth=h.depth; }
  return { car:s.car, prog:progress(s.car), maxDepth, dirty:s.dirty || s.laps.some(l=>l.dirty) };
}

const v2 = runInto(2);
ok(v2.maxDepth < 0.35, 'v2 car never deeply penetrates the wall (pushed out each tick)');
ok(v2.prog < wallProg, 'v2 car is stopped short of the wall, not through it');
ok(v2.car.v < 3, 'v2 impulse removes the into-wall speed');
ok(v2.dirty, 'v2 contact marks the lap dirty');

const v1 = runInto(1);
ok(v1.prog > wallProg + 1, 'v1 car passes through the wall (detection-only, no response)');
ok(v1.maxDepth > 1, 'v1 penetrates the wall unresolved');

// determinism through collision response
const a = runInto(2), b = runInto(2);
ok(JSON.stringify(a.car) === JSON.stringify(b.car), 'v2 collision response is deterministic');

console.log(failed === 0 ? '\nALL PASS - physics v2 Phase 2 collision response verified' : `\n${failed} FAILED`);
if (failed) process.exit(1);
