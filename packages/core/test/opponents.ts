// Physics v2 Phase 2 item 2: opponents run through the same stepVehicle model + collision.
// v1 keeps kinematic centerline-following opponents (unchanged).
import { DT, buildWorld } from '../src/index.ts';
import { makeSim, tick } from '../src/sim/runner.ts';
import { makeGraph } from '../src/graph/engine.ts';
import type { SceneObject, World } from '../src/index.ts';

let failed = 0;
function ok(cond: boolean, msg: string) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; }

const rival = (): SceneObject => ({ id:'rival', kind:'vehicle', trackIndex:20, trackSpeed:6,
  pose:{ x:0, y:0, yaw:0 }, velocity:{ x:0, y:0 }, yawRate:0,
  shape:{ type:'box', radius:0, length:4.2, width:1.9 }, confidence:1 } as any);
const idle = makeGraph({ c:{ type:'const', params:{ value:0 } }, t:{ type:'sink.throttle', in:{ x:['n','c','v'] } } });

// ---- v2: the opponent is a real vehicle driven by its own controller ----
{ const w: World = { ...buildWorld({ physicsVersion:2 }), objects:[rival()] };
  const s = makeSim(w, idle, 1);
  ok(s.opponents.length === 1, 'v2 promotes the moving rival to a physical opponent');
  const startIdx = s.opponents[0].car.idx;
  for (let i=0;i<360;i++) tick(s);
  const opp = s.opponents[0].car;
  ok(opp.onTrack, 'opponent stays on track under its pure-pursuit brain');
  ok(opp.vx > 3 && opp.vx < 9, 'opponent holds a grip-respecting cruise speed near its target');
  const advanced = ((opp.idx - startIdx) % w.track.N + w.track.N) % w.track.N;
  ok(advanced > 12, 'opponent makes real forward progress around the track');
  ok(isFinite(opp.x) && isFinite(opp.vx), 'opponent state is finite (no teleport/blowup)'); }

// ---- v2 determinism through opponents ----
{ const run = () => { const s = makeSim({ ...buildWorld({ physicsVersion:2 }), objects:[rival()] }, idle, 7); for(let i=0;i<200;i++) tick(s); return s.opponents[0].car; };
  ok(JSON.stringify(run()) === JSON.stringify(run()), 'v2 opponent simulation is deterministic'); }

// ---- v1: opponent stays kinematic (centerline follower), unchanged ----
{ const w: World = { ...buildWorld(), objects:[rival()] };
  const s = makeSim(w, idle, 1);
  ok(s.opponents.length === 0, 'v1 keeps opponents kinematic (no physical opponent state)');
  for (let i=0;i<50;i++) tick(s);
  const T = w.track, expectI = Math.floor((20 + 6*s.elapsed/T.spacing) % T.N);
  ok(Math.abs(s.objects[0].pose.x - T.pts[expectI][0]) < 1e-9 && Math.abs(s.objects[0].pose.y - T.pts[expectI][1]) < 1e-9,
     'v1 opponent pose still matches the kinematic centerline formula'); }

console.log(failed === 0 ? '\nALL PASS - physics v2 Phase 2 opponents run the shared vehicle model' : `\n${failed} FAILED`);
if (failed) process.exit(1);
