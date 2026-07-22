// Unit checks for P-a L0 primitives (math / logic / vector / array / stateful).
import { makeGraph, evalGraph, type EvalCtx } from '../src/graph/engine.ts';
import { NT } from '../src/graph/registry.ts';
import { buildWorld, curvAheadAt, G } from '../src/sim/world.ts';
import { makeRng } from '../src/rng.ts';
import { castScan, initCar } from '../src/sim/vehicle.ts';

let failed = 0;
function ok(cond: boolean, msg: string) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; }
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

const world = buildWorld();
function ctx(): EvalCtx { return { obs:{}, cmd:{steer:0,throttle:0}, state:{}, rng:makeRng(1), world, car:{} as any, dt:1/120 }; }
function one(nodes: any, outNode: string, outPort: string, c = ctx()) {
  const g = makeGraph(nodes, outNode, outPort); const v = evalGraph(g, c, NT); return v[outNode][outPort];
}
const L = (x: unknown) => ['lit', x] as any;

// --- math ---
ok(near(one({ n:{ type:'hypot', in:{ a:L(3), b:L(4) } } }, 'n', 'v'), 5), 'hypot(3,4)=5');
ok(near(one({ n:{ type:'sqrt', in:{ x:L(9) } } }, 'n', 'v'), 3), 'sqrt(9)=3');
ok(near(one({ n:{ type:'atan2', in:{ y:L(1), x:L(0) } } }, 'n', 'v'), Math.PI/2), 'atan2(1,0)=pi/2');
ok(near(one({ n:{ type:'wrapAngle', in:{ x:L(2*Math.PI+0.5) } } }, 'n', 'v'), 0.5), 'wrapAngle(2pi+0.5)=0.5');
ok(near(one({ n:{ type:'min', in:{ a:L(2), b:L(5) } } }, 'n', 'v'), 2), 'min(2,5)=2');
ok(near(one({ n:{ type:'lerp', in:{ a:L(0), b:L(10), t:L(0.3) } } }, 'n', 'v'), 3), 'lerp(0,10,.3)=3');

// --- logic ---
ok(one({ n:{ type:'ge', in:{ a:L(5), b:L(5) } } }, 'n', 'v') === true, 'ge(5,5)=true');
ok(one({ n:{ type:'and', in:{ a:L(true), b:L(false) } } }, 'n', 'v') === false, 'and(T,F)=false');

// --- vector ---
ok(near(one({ v:{ type:'vec.make', in:{ x:L(3), y:L(4) } }, n:{ type:'vec.len', in:{ e:['n','v','e'] } } }, 'n', 'v'), 5), 'len(make(3,4))=5');
{ const r = one({ v:{ type:'vec.rotate', in:{ e:L({x:1,y:0}), th:L(Math.PI/2) } } }, 'v', 'e'); ok(near(r.x,0)&&near(r.y,1), 'rotate((1,0),90°)=(0,1)'); }
ok(near(one({ n:{ type:'vec.dot', in:{ a:L({x:1,y:2}), b:L({x:3,y:4}) } } }, 'n', 'v'), 11), 'dot=11');

// --- struct decomposition ---
{ const pose = {x:3.5,y:-2.25,yaw:0.75}; const g=makeGraph({ n:{type:'pose.parts',in:{pose:L(pose)}} }); const v=evalGraph(g,ctx(),NT).n;
  ok(v.x===pose.x&&v.y===pose.y&&v.yaw===pose.yaw, 'pose.parts exposes x/y/yaw'); }
{ const waypoint = {x:1,y:2,s:3,kappa:0.04,psi:0.5,vref:8}; const g=makeGraph({ n:{type:'wpt.parts',in:{waypoint:L(waypoint)}} }); const v=evalGraph(g,ctx(),NT).n;
  ok(v.x===1&&v.y===2&&v.s===3&&v.kappa===0.04&&v.psi===0.5&&v.vref===8, 'wpt.parts exposes waypoint fields'); }

// --- path primitives over the provided closed centerline ---
{ const T=world.track, sourceIndex=7, pt={x:T.pts[sourceIndex][0],y:T.pts[sourceIndex][1]};
  const nearest=one({ n:{type:'path.nearestIndex',in:{track:L(T),pt:L(pt)}} },'n','i');
  ok(nearest===sourceIndex, 'path.nearestIndex finds exact centerline point');
  const distance=6, advanced=one({ n:{type:'path.advanceByDist',in:{track:L(T),i:L(nearest),d:L(distance)}} },'n','pt');
  const target=(sourceIndex+Math.max(1,Math.round(distance/T.spacing)))%T.N;
  ok(advanced.x===T.pts[target][0]&&advanced.y===T.pts[target][1], 'path.advanceByDist matches track spacing'); }
{ const T=world.track, idx=7;
  const w=one({n:{type:'path.at',in:{track:L(T),i:L(idx)}}},'n','waypoint');
  ok(w.x===T.pts[idx][0]&&w.y===T.pts[idx][1]&&w.kappa===T.curv[idx], 'path.at exposes a typed waypoint');
  const curve=one({n:{type:'path.maxCurvature',in:{track:L(T),i:L(idx),d:L(18)}}},'n','k');
  ok(curve===curvAheadAt(T,idx,18), 'path.maxCurvature preserves world formula'); }

// --- shipped L1 geometry is openable and numerically equivalent to the old formulas ---
ok(NT['std.lookahead'].kind==='composite'&&!!NT['std.lookahead'].sub, 'std.lookahead is an openable composite');
ok(NT['std.tocar'].kind==='composite'&&!!NT['std.tocar'].sub, 'std.tocar is an openable composite');
ok(NT['std.curvAhead'].kind==='composite'&&!!NT['std.curvAhead'].sub, 'std.curvAhead is an openable composite');
ok(NT['std.gripSpeed'].kind==='composite'&&!!NT['std.gripSpeed'].sub, 'std.gripSpeed is an openable composite');
ok(['std.nearestWpt','std.crossTrack','std.headingErr','lidar.preprocess','lidar.widestGap','lidar.freeAhead'].every(t=>NT[t].kind==='composite'&&!!NT[t].sub), 'new L1 geometry/LiDAR nodes are openable composites');
{ const T=world.track, idx=12, psi=Math.atan2(T.tan[idx][1],T.tan[idx][0]);
  const pose={x:T.pts[idx][0]+T.nrm[idx][0]*2,y:T.pts[idx][1]+T.nrm[idx][1]*2,yaw:psi-0.3};
  const curve=one({n:{type:'std.curvAhead',in:{pose:L(pose),track:L(T)}}},'n','k');
  ok(curve===curvAheadAt(T,idx,18), 'curvature composite preserves old formula exactly');
  const grip=one({n:{type:'std.gripSpeed',params:{vmax:13,margin:0.85},in:{k:L(curve)}}},'n','v');
  ok(grip===Math.min(13,Math.sqrt(world.mu*G/Math.max(curve,0.004))*0.85), 'grip-speed composite preserves old formula exactly');
  const nearest=one({n:{type:'std.nearestWpt',in:{track:L(T),pt:L({x:pose.x,y:pose.y})}}},'n','waypoint');
  ok(nearest.x===T.pts[idx][0]&&nearest.kappa===T.curv[idx], 'nearest-waypoint composite returns path data');
  const cross=one({n:{type:'std.crossTrack',in:{pose:L(pose),track:L(T)}}},'n','e');
  ok(near(cross,2), 'cross-track composite returns signed lateral distance');
  const heading=one({n:{type:'std.headingErr',in:{pose:L(pose),track:L(T)}}},'n','e');
  ok(near(heading,0.3), 'heading-error composite wraps path minus vehicle yaw');
  const gap=one({n:{type:'lidar.widestGap',in:{ranges:L([1,4,2,8,3])}}},'n','i');
  const clean=one({n:{type:'lidar.preprocess',params:{maxRange:30},in:{ranges:L([NaN,4,-2,40,3])}}},'n','ranges');
  ok(JSON.stringify(clean)==='[0,4,0,30,3]', 'LiDAR preprocess sanitizes and clips ranges');
  const free=one({n:{type:'lidar.freeAhead',params:{width:3},in:{ranges:L([9,9,9,8,2,7,9,9,9])}}},'n','d');
  ok(free===2, 'free-ahead composite reads the central safety window');
  ok(gap===3, 'widest-gap composite exposes the most open beam'); }
{ const pose={x:world.track.pts[5][0]+0.2,y:world.track.pts[5][1]-0.1,yaw:0.37}, Ld=6;
  const g=makeGraph({ look:{type:'std.lookahead',in:{pose:L(pose),track:L(world.track),Ld:L(Ld)}} }); const v=evalGraph(g,ctx(),NT).look;
  const nearest=one({n:{type:'path.nearestIndex',in:{track:L(world.track),pt:L({x:pose.x,y:pose.y})}}},'n','i');
  const target=(nearest+Math.max(1,Math.round(Ld/world.track.spacing)))%world.track.N;
  ok(v.idx===nearest&&v.pt.x===world.track.pts[target][0]&&v.pt.y===world.track.pts[target][1], 'lookahead composite preserves point/index formula');
  const e=one({n:{type:'std.tocar',in:{pt:L(v.pt),pose:L(pose)}}},'n','e'), dx=v.pt.x-pose.x, dy=v.pt.y-pose.y, cs=Math.cos(pose.yaw), sn=Math.sin(pose.yaw);
  ok(e.x===cs*dx+sn*dy&&e.y===-sn*dx+cs*dy, 'to-car composite preserves coordinate formula exactly'); }

// --- array ---
ok(near(one({ n:{ type:'array.sum', in:{ arr:L([1,2,3,4]) } } }, 'n', 'v'), 10), 'sum=10');
ok(one({ n:{ type:'array.argmin', in:{ arr:L([5,2,9,1,7]) } } }, 'n', 'i') === 3, 'argmin idx=3');
{ const w = one({ n:{ type:'array.window', in:{ arr:L([0,1,2,3,4]), i:L(3), w:L(4) } } }, 'n', 'v'); ok(JSON.stringify(w)==='[3,4,0,1]', 'window wraps closed track'); }
{ const d = one({ n:{ type:'array.diff', in:{ arr:L([1,4,9,16]) } } }, 'n', 'v'); ok(JSON.stringify(d)==='[3,5,7]', 'diff'); }

// --- higher-order with inner lambda subgraphs ---
const sumLam = makeGraph({ a:{ type:'arg' }, ac:{ type:'argacc' }, s:{ type:'add', in:{ a:['n','a','v'], b:['n','ac','v'] } } }, 's', 'v');
ok(near(one({ n:{ type:'array.reduce', params:{ lambda:sumLam }, in:{ arr:L([1,2,3,4,5]), init:L(0) } } }, 'n', 'v'), 15), 'reduce(+)=15');
const mulLam = makeGraph({ a:{ type:'arg' }, b:{ type:'arg2' }, m:{ type:'mul', in:{ a:['n','a','v'], b:['n','b','v'] } } }, 'm', 'v');
{ const z = one({ n:{ type:'array.zipWith', params:{ lambda:mulLam }, in:{ a:L([1,2,3]), b:L([4,5,6]) } } }, 'n', 'v'); ok(JSON.stringify(z)==='[4,10,18]', 'zipWith(×)'); }

// --- stateful across ticks (deterministic accumulation) ---
{ const g = makeGraph({ n:{ type:'st.accum', in:{ x:L(120) } } }, 'n', 'v'); const c = ctx();
// --- scene observation and LiDAR integration ---
{ const car=initCar(world), object:any={
    id:'test-obstacle',kind:'static',pose:{x:car.x+Math.cos(car.yaw)*5,y:car.y+Math.sin(car.yaw)*5,yaw:car.yaw},
    velocity:{x:0,y:0},yawRate:0,shape:{type:'box',radius:0,length:2,width:2},confidence:1,
  };
  const base=castScan(car,world), blocked=castScan(car,world,21,2,[object]);
  ok(blocked.ranges[10]<base.ranges[10], 'LiDAR ranges include mission obstacles');
  const c=ctx();c.obs.objects=[object];
  const objects=one({n:{type:'src.objects'}},'n','objects',c);
  ok(objects.length===1&&objects[0].id==='test-obstacle','src.objects exposes observed scene objects'); }
  const a = evalGraph(g,c,NT)['n'].v, b = evalGraph(g,c,NT)['n'].v, d = evalGraph(g,c,NT)['n'].v;
  ok(near(a,1)&&near(b,2)&&near(d,3), 'st.accum(120)·dt accumulates 1,2,3'); }
{ const g = makeGraph({ n:{ type:'st.delay', in:{ x:L(7) } } }, 'n', 'v'); const c = ctx();
  const a = evalGraph(g,c,NT)['n'].v, b = evalGraph(g,c,NT)['n'].v;
  ok(near(a,0)&&near(b,7), 'st.delay: first 0 then previous'); }

// --- composite: grip speed sqrt(mu*g/k) buildable from primitives matches std.gripSpeed core ---
{ const k = 0.05;
  const built = one({ mu:{ type:'const', params:{ value:world.mu } }, g:{ type:'const', params:{ value:G } },
    num:{ type:'mul', in:{ a:['n','mu','v'], b:['n','g','v'] } },
    v:{ type:'div', in:{ a:['n','num','v'], b:L(k) } },
    s:{ type:'sqrt', in:{ x:['n','v','v'] } } }, 's', 'v');
  ok(near(built, Math.sqrt(world.mu*G/k), 1e-6), 'grip √(μg/κ) from primitives matches'); }

console.log(failed ? `\n❌ ${failed} FAILED` : '\n✅ ALL PASS — P-a primitives correct');
process.exit(failed ? 1 : 0);
