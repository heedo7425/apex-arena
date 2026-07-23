// Node registry: L0 primitives, L1 standard library, sources/sinks,
// plus reserved hooks (rng.uniform, sim.predict) for MPPI/MPC/RL.
import { type NodeDef, type EvalCtx, type Graph, evalGraph, makeGraph } from './engine.ts';
import { nearestIndex, curvAheadAt, G } from '../sim/world.ts';
import { stepVehicle } from '../sim/vehicle.ts';
import { uniform, gaussian } from '../rng.ts';
import {
  makeVehicleObject, makeStaticObject, relativeObject, nearestObject, objectsInRadius,
  corridorFromTrack, spaceFromTrack, blockObject, spaceContains, currentState,
  rolloutTrajectory, rolloutCommandSequence, predictConstantVelocity, trajectoryClearance, trajectoryProgress,
  predictionClearance, selectMinTrajectory, makeIntent, requestFromIntent, evaluateTrajectory,
  trackFromPoints, resampleTrack, offsetTrack, midpointTrack,
  type CostTerm, type Constraint,
} from '../planning/types.ts';

function argmaxArr(a: number[]): number { let bi = 0, bv = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > bv) { bv = a[i]; bi = i; } return bi; }

// ---- composite node: a shipped/user block = an inner sub-graph (openable, forkable) ----
// Inner nodes read the block's inputs via `cin` (composite-in); state is namespaced per instance.
function composite(cat: string, ins: string[], outs: string[], sub: Graph, outMap: Record<string, [string, string]>): NodeDef {
  return { kind:'composite', cat, ins, outs, sub, outMap, fn:(inv,p,st,ctx)=>{
    const savedCin=ctx.__cin, savedParams=ctx.__cparams, savedState=ctx.state;
    ctx.__cin=inv; ctx.__cparams=p; ctx.state=(st.__inner ||= {});
    const v=evalGraph(sub,ctx,NT);
    ctx.__cin=savedCin; ctx.__cparams=savedParams; ctx.state=savedState;
    const o:Record<string,any>={}; for (const k in outMap) o[k]=v[outMap[k][0]]?.[outMap[k][1]];
    o.__inner=v;
    return o;
  } };
}

// Shipped L1 geometry blocks are expressed only with visible L0/boundary nodes.
const LOOKAHEAD_SUB: Graph = makeGraph({
  poseIn:{ type:'cin', params:{ port:'pose' } }, trackIn:{ type:'cin', params:{ port:'track' } }, distanceIn:{ type:'cin', params:{ port:'Ld' } },
  poseParts:{ type:'pose.parts', in:{ pose:['n','poseIn','v'] } },
  posePoint:{ type:'vec.make', in:{ x:['n','poseParts','x'], y:['n','poseParts','y'] } },
  nearest:{ type:'path.nearestIndex', in:{ track:['n','trackIn','v'], pt:['n','posePoint','e'] } },
  ahead:{ type:'path.advanceByDist', in:{ track:['n','trackIn','v'], i:['n','nearest','i'], d:['n','distanceIn','v'] } },
});

const TOCAR_SUB: Graph = makeGraph({
  pointIn:{ type:'cin', params:{ port:'pt' } }, poseIn:{ type:'cin', params:{ port:'pose' } },
  poseParts:{ type:'pose.parts', in:{ pose:['n','poseIn','v'] } },
  posePoint:{ type:'vec.make', in:{ x:['n','poseParts','x'], y:['n','poseParts','y'] } },
  delta:{ type:'vec.sub', in:{ a:['n','pointIn','v'], b:['n','posePoint','e'] } },
  negYaw:{ type:'neg', in:{ x:['n','poseParts','yaw'] } },
  local:{ type:'vec.rotate', in:{ e:['n','delta','e'], th:['n','negYaw','v'] } },
});

const CURVAHEAD_SUB: Graph = makeGraph({
  poseIn:{ type:'cin', params:{ port:'pose' } }, trackIn:{ type:'cin', params:{ port:'track' } },
  poseParts:{ type:'pose.parts', in:{ pose:['n','poseIn','v'] } },
  posePoint:{ type:'vec.make', in:{ x:['n','poseParts','x'], y:['n','poseParts','y'] } },
  nearest:{ type:'path.nearestIndex', in:{ track:['n','trackIn','v'], pt:['n','posePoint','e'] } },
  distance:{ type:'const', params:{ value:18 } },
  curve:{ type:'path.maxCurvature', in:{ track:['n','trackIn','v'], i:['n','nearest','i'], d:['n','distance','v'] } },
});

const GRIPSPEED_SUB: Graph = makeGraph({
  curveIn:{ type:'cin', params:{ port:'k' } }, surface:{ type:'src.surface' },
  vmax:{ type:'cparam', params:{ param:'vmax', fallback:13 } }, margin:{ type:'cparam', params:{ param:'margin', fallback:0.85 } },
  floor:{ type:'const', params:{ value:0.004 } }, safeCurve:{ type:'max', in:{ a:['n','curveIn','v'], b:['n','floor','v'] } },
  grip:{ type:'mul', in:{ a:['n','surface','mu'], b:['n','surface','g'] } },
  ratio:{ type:'div', in:{ a:['n','grip','v'], b:['n','safeCurve','v'] } }, root:{ type:'sqrt', in:{ x:['n','ratio','v'] } },
  scaled:{ type:'mul', in:{ a:['n','root','v'], b:['n','margin','v'] } }, limited:{ type:'min', in:{ a:['n','vmax','v'], b:['n','scaled','v'] } },
});

const NEAREST_WPT_SUB: Graph = makeGraph({
  trackIn:{ type:'cin', params:{ port:'track' } }, pointIn:{ type:'cin', params:{ port:'pt' } },
  nearest:{ type:'path.nearestIndex', in:{ track:['n','trackIn','v'], pt:['n','pointIn','v'] } },
  waypoint:{ type:'path.at', in:{ track:['n','trackIn','v'], i:['n','nearest','i'] } },
});

const CROSS_TRACK_SUB: Graph = makeGraph({
  poseIn:{ type:'cin', params:{ port:'pose' } }, trackIn:{ type:'cin', params:{ port:'track' } },
  poseParts:{ type:'pose.parts', in:{ pose:['n','poseIn','v'] } }, posePoint:{ type:'vec.make', in:{ x:['n','poseParts','x'], y:['n','poseParts','y'] } },
  nearest:{ type:'path.nearestIndex', in:{ track:['n','trackIn','v'], pt:['n','posePoint','e'] } },
  waypoint:{ type:'path.at', in:{ track:['n','trackIn','v'], i:['n','nearest','i'] } }, parts:{ type:'wpt.parts', in:{ waypoint:['n','waypoint','waypoint'] } },
  pathPoint:{ type:'vec.make', in:{ x:['n','parts','x'], y:['n','parts','y'] } }, delta:{ type:'vec.sub', in:{ a:['n','posePoint','e'], b:['n','pathPoint','e'] } },
  quarterTurn:{ type:'const', params:{ value:Math.PI/2 } }, normalAngle:{ type:'add', in:{ a:['n','parts','psi'], b:['n','quarterTurn','v'] } },
  nx:{ type:'cos', in:{ x:['n','normalAngle','v'] } }, ny:{ type:'sin', in:{ x:['n','normalAngle','v'] } },
  normal:{ type:'vec.make', in:{ x:['n','nx','v'], y:['n','ny','v'] } }, error:{ type:'vec.dot', in:{ a:['n','delta','e'], b:['n','normal','e'] } },
});

const HEADING_ERR_SUB: Graph = makeGraph({
  poseIn:{ type:'cin', params:{ port:'pose' } }, trackIn:{ type:'cin', params:{ port:'track' } },
  poseParts:{ type:'pose.parts', in:{ pose:['n','poseIn','v'] } }, posePoint:{ type:'vec.make', in:{ x:['n','poseParts','x'], y:['n','poseParts','y'] } },
  nearest:{ type:'path.nearestIndex', in:{ track:['n','trackIn','v'], pt:['n','posePoint','e'] } },
  waypoint:{ type:'path.at', in:{ track:['n','trackIn','v'], i:['n','nearest','i'] } }, parts:{ type:'wpt.parts', in:{ waypoint:['n','waypoint','waypoint'] } },
  raw:{ type:'sub', in:{ a:['n','parts','psi'], b:['n','poseParts','yaw'] } }, error:{ type:'wrapAngle', in:{ x:['n','raw','v'] } },
});

const WIDEST_GAP_SUB: Graph = makeGraph({
  rangesIn:{ type:'cin', params:{ port:'ranges' } }, threshold:{ type:'cparam', params:{ param:'minClear', fallback:3 } },
  widest:{ type:'array.widestAbove', in:{ arr:['n','rangesIn','v'], min:['n','threshold','v'] } },
});

const LIDAR_PREPROCESS_SUB: Graph = makeGraph({
  rangesIn:{ type:'cin', params:{ port:'ranges' } }, maxRange:{ type:'cparam', params:{ param:'maxRange', fallback:30 } },
  clean:{ type:'array.sanitizeRanges', in:{ arr:['n','rangesIn','v'], max:['n','maxRange','v'] } },
});

const FREE_AHEAD_SUB: Graph = makeGraph({
  rangesIn:{ type:'cin', params:{ port:'ranges' } }, width:{ type:'cparam', params:{ param:'width', fallback:5 } },
  clear:{ type:'array.centerMin', in:{ arr:['n','rangesIn','v'], w:['n','width','v'] } },
});

// Explicit-input controller vocabulary for virtual states, alternate paths and testing.
const PURSUIT_CTRL_SUB: Graph = makeGraph({
  pose:{ type:'cin', params:{ port:'pose' } }, track:{ type:'cin', params:{ port:'track' } }, Ld:{ type:'cin', params:{ port:'Ld' } },
  look:{ type:'std.lookahead', in:{ pose:['n','pose','v'], track:['n','track','v'], Ld:['n','Ld','v'] } },
  local:{ type:'std.tocar', in:{ pt:['n','look','pt'], pose:['n','pose','v'] } },
  xy:{ type:'vec.xy', in:{ e:['n','local','e'] } }, dist:{ type:'vec.len', in:{ e:['n','local','e'] } },
  two:{ type:'const', params:{ value:2 } }, twoY:{ type:'mul', in:{ a:['n','two','v'], b:['n','xy','y'] } },
  dsq:{ type:'mul', in:{ a:['n','dist','v'], b:['n','dist','v'] } }, curve:{ type:'div', in:{ a:['n','twoY','v'], b:['n','dsq','v'] } },
  gain:{ type:'cparam', params:{ param:'gain', fallback:5.2 } }, raw:{ type:'mul', in:{ a:['n','curve','v'], b:['n','gain','v'] } },
  steer:{ type:'clamp', params:{ lo:-1, hi:1 }, in:{ x:['n','raw','v'] } },
});
const SPEED_CTRL_SUB: Graph = makeGraph({
  speed:{ type:'cin', params:{ port:'speed' } }, target:{ type:'cin', params:{ port:'target' } },
  error:{ type:'sub', in:{ a:['n','target','v'], b:['n','speed','v'] } },
  pid:{ type:'ctrl.pid', params:{ kp:0.6,ki:0.06,kd:0 }, in:{ err:['n','error','v'] } },
  throttle:{ type:'clamp', params:{ lo:-1,hi:1 }, in:{ x:['n','pid','u'] } },
});

// Inner sub-graph: Pure Pursuit steering (what the player builds in L2) → steer.
const PURSUIT_SUB: Graph = makeGraph({
  pose:{ type:'src.pose' }, track:{ type:'src.track' }, Ld:{ type:'const', params:{ value:6 } },
  look:{ type:'std.lookahead', in:{ pose:['n','pose','pose'], track:['n','track','track'], Ld:['n','Ld','v'] } },
  e:{ type:'std.tocar', in:{ pt:['n','look','pt'], pose:['n','pose','pose'] } },
  comp:{ type:'vec.xy', in:{ e:['n','e','e'] } }, dist:{ type:'vec.len', in:{ e:['n','e','e'] } },
  two:{ type:'const', params:{ value:2 } }, twoY:{ type:'mul', in:{ a:['n','two','v'], b:['n','comp','y'] } },
  dsq:{ type:'mul', in:{ a:['n','dist','v'], b:['n','dist','v'] } }, k:{ type:'div', in:{ a:['n','twoY','v'], b:['n','dsq','v'] } },
  gain:{ type:'const', params:{ value:5.2 } }, sraw:{ type:'mul', in:{ a:['n','k','v'], b:['n','gain','v'] } },
  steer:{ type:'clamp', params:{ lo:-1, hi:1 }, in:{ x:['n','sraw','v'] } },
});
// Inner sub-graph: speed PID (what the player builds in L1). target → throttle.
const SPEEDPID_SUB: Graph = makeGraph({
  sp:{ type:'src.speed' }, tgt:{ type:'cin', params:{ port:'target' } },
  verr:{ type:'sub', in:{ a:['n','tgt','v'], b:['n','sp','v'] } },
  pid:{ type:'ctrl.pid', params:{ kp:0.6, ki:0.06, kd:0 }, in:{ err:['n','verr','v'] } },
  thr:{ type:'clamp', params:{ lo:-1, hi:1 }, in:{ x:['n','pid','u'] } },
});

// PID remains a reusable controller but its P/I/D structure is inspectable.
// The two state primitives own only the irreducible tick memory.
const PID_SUB: Graph = makeGraph({
  err:{ type:'cin', params:{ port:'err' } },
  kp:{ type:'cparam', params:{ param:'kp', fallback:0.6 } },
  ki:{ type:'cparam', params:{ param:'ki', fallback:0.06 } },
  kd:{ type:'cparam', params:{ param:'kd', fallback:0 } },
  integral:{ type:'st.pidIntegral', in:{ x:['n','err','v'] } },
  derivative:{ type:'st.pidDerivative', in:{ x:['n','err','v'] } },
  pTerm:{ type:'mul', in:{ a:['n','err','v'], b:['n','kp','v'] } },
  iTerm:{ type:'mul', in:{ a:['n','integral','v'], b:['n','ki','v'] } },
  dTerm:{ type:'mul', in:{ a:['n','derivative','v'], b:['n','kd','v'] } },
  pi:{ type:'add', in:{ a:['n','pTerm','v'], b:['n','iTerm','v'] } },
  u:{ type:'add', in:{ a:['n','pi','v'], b:['n','dTerm','v'] } },
});

// A deliberately small policy head: features stay visible and the learned weights
// are parameters, so this is an inspectable inference boundary rather than an RL algorithm.
const LINEAR_POLICY_SUB: Graph = makeGraph({
  x1:{ type:'cin', params:{ port:'x1' } }, x2:{ type:'cin', params:{ port:'x2' } },
  w1:{ type:'cparam', params:{ param:'w1', fallback:-0.4 } },
  w2:{ type:'cparam', params:{ param:'w2', fallback:1.8 } },
  bias:{ type:'cparam', params:{ param:'b', fallback:0 } },
  term1:{ type:'mul', in:{ a:['n','x1','v'], b:['n','w1','v'] } },
  term2:{ type:'mul', in:{ a:['n','x2','v'], b:['n','w2','v'] } },
  sum:{ type:'add', in:{ a:['n','term1','v'], b:['n','term2','v'] } },
  action:{ type:'add', in:{ a:['n','sum','v'], b:['n','bias','v'] } },
});

// Reward stays separate from actuation and cannot write a vehicle command directly.
const TRACK_REWARD_SUB: Graph = makeGraph({
  speed:{ type:'cin', params:{ port:'speed' } }, cte:{ type:'cin', params:{ port:'cte' } }, onTrack:{ type:'cin', params:{ port:'onTrack' } },
  weight:{ type:'cparam', params:{ param:'trackingWeight', fallback:1.5 } },
  penalty:{ type:'cparam', params:{ param:'offtrackPenalty', fallback:-20 } },
  magnitude:{ type:'abs', in:{ x:['n','cte','v'] } },
  trackingCost:{ type:'mul', in:{ a:['n','magnitude','v'], b:['n','weight','v'] } },
  movingReward:{ type:'sub', in:{ a:['n','speed','v'], b:['n','trackingCost','v'] } },
  reward:{ type:'select', in:{ c:['n','onTrack','v'], a:['n','movingReward','v'], b:['n','penalty','v'] } },
});

export const NT: Record<string, NodeDef> = {
  // ---- sources (read observation) ----
  'src.scan':  { kind:'source', cat:'Sensors', outs:['ranges','a0','da'], fn:(i,p,s,c)=>{ const sc:any=c.obs.scan; return { ranges:sc.ranges, a0:sc.a0, da:sc.da }; } },
  'src.speed': { kind:'source', cat:'Sensors', outs:['v'], fn:(i,p,s,c)=>({ v:c.obs.speed }) },
  'src.pose':  { kind:'source', cat:'Sensors', outs:['pose'], fn:(i,p,s,c)=>({ pose:c.obs.pose }) },
  'src.track': { kind:'source', cat:'Sensors', outs:['track'], fn:(i,p,s,c)=>({ track:c.obs.track }) },
  'src.surface': { kind:'source', cat:'Sensors', outs:['mu','g'], fn:(i,p,s,c)=>({ mu:c.world.mu, g:G }) },

  'src.vehicleState': { kind:'source', cat:'Sensors', outs:['state'], fn:(i,p,s,c)=>({ state:currentState(c.car) }) },
  'src.objects': { kind:'source', cat:'Sensors', outs:['objects'], fn:(i,p,s,c)=>({ objects:c.obs.objects ?? [] }) },
  // ---- L0 primitives: math ----
  'const': { kind:'prim', cat:'Math', outs:['v'], fn:(i,p)=>({ v:p.value }) },
  'add': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a+i.b }) },
  'sub': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a-i.b }) },
  'mul': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a*i.b }) },
  'div': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a/(i.b||1e-6) }) },
  'abs': { kind:'prim', cat:'Math', ins:['x'], outs:['v'], fn:(i)=>({ v:Math.abs(i.x) }) },
  'neg': { kind:'prim', cat:'Math', ins:['x'], outs:['v'], fn:(i)=>({ v:-i.x }) },
  'sign': { kind:'prim', cat:'Math', ins:['x'], outs:['v'], fn:(i)=>({ v:Math.sign(i.x) }) },
  'mod': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a-Math.floor(i.a/(i.b||1e-6))*(i.b||1e-6) }) },
  'pow': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:Math.pow(i.a,i.b) }) },
  'sqrt': { kind:'prim', cat:'Math', ins:['x'], outs:['v'], fn:(i)=>({ v:Math.sqrt(Math.max(0,i.x)) }) },
  'min': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:Math.min(i.a,i.b) }) },
  'max': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:Math.max(i.a,i.b) }) },
  'clamp': { kind:'prim', cat:'Math', ins:['x'], outs:['v'], fn:(i,p)=>({ v:Math.max(p.lo,Math.min(p.hi,i.x)) }) },
  'lerp': { kind:'prim', cat:'Math', ins:['a','b','t'], outs:['v'], fn:(i)=>({ v:i.a+(i.b-i.a)*i.t }) },
  'sin': { kind:'prim', cat:'Math', ins:['x'], outs:['v'], fn:(i)=>({ v:Math.sin(i.x) }) },
  'cos': { kind:'prim', cat:'Math', ins:['x'], outs:['v'], fn:(i)=>({ v:Math.cos(i.x) }) },
  'atan2': { kind:'prim', cat:'Math', ins:['y','x'], outs:['v'], fn:(i)=>({ v:Math.atan2(i.y,i.x) }) },
  'hypot': { kind:'prim', cat:'Math', ins:['a','b'], outs:['v'], fn:(i)=>({ v:Math.hypot(i.a,i.b) }) },
  'wrapAngle': { kind:'prim', cat:'Math', ins:['x'], outs:['v'], fn:(i)=>{ let a=(i.x+Math.PI)%(2*Math.PI); if(a<0)a+=2*Math.PI; return { v:a-Math.PI }; } },

  // ---- L0 primitives: logic ----
  'lt': { kind:'prim', cat:'Logic', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a<i.b }) },
  'gt': { kind:'prim', cat:'Logic', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a>i.b }) },
  'le': { kind:'prim', cat:'Logic', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a<=i.b }) },
  'ge': { kind:'prim', cat:'Logic', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a>=i.b }) },
  'eq': { kind:'prim', cat:'Logic', ins:['a','b'], outs:['v'], fn:(i)=>({ v:Math.abs(i.a-i.b)<1e-9 }) },
  'ne': { kind:'prim', cat:'Logic', ins:['a','b'], outs:['v'], fn:(i)=>({ v:Math.abs(i.a-i.b)>=1e-9 }) },
  'and': { kind:'prim', cat:'Logic', ins:['a','b'], outs:['v'], fn:(i)=>({ v:!!i.a&&!!i.b }) },
  'or': { kind:'prim', cat:'Logic', ins:['a','b'], outs:['v'], fn:(i)=>({ v:!!i.a||!!i.b }) },
  'not': { kind:'prim', cat:'Logic', ins:['x'], outs:['v'], fn:(i)=>({ v:!i.x }) },
  'select': { kind:'prim', cat:'Logic', ins:['c','a','b'], outs:['v'], fn:(i)=>({ v:i.c?i.a:i.b }) },

  // ---- L0 primitives: array & iteration (higher-order) ----
  'arg': { kind:'prim', cat:'Array', outs:['v'], fn:(i,p,s,c)=>({ v:c.__arg }) },
  'array.map': { kind:'higher', cat:'Array', ins:['arr'], outs:['v'], fn:(i,p,s,c)=>{
    const lam:Graph=p.lambda, out:any[]=[], saved=c.__arg;
    for (let k=0;k<i.arr.length;k++){ c.__arg=i.arr[k]; const v=evalGraph(lam,c,NT); out.push(v[lam.outNode!][lam.outPort!]); }
    c.__arg=saved; return { v:out };
  } },
  'arg2': { kind:'prim', cat:'Array', outs:['v'], fn:(i,p,s,c)=>({ v:c.__arg2 }) },
  'argacc': { kind:'prim', cat:'Array', outs:['v'], fn:(i,p,s,c)=>({ v:c.__argAcc }) },
  'array.filter': { kind:'higher', cat:'Array', ins:['arr'], outs:['v'], fn:(i,p,s,c)=>{
    const lam:Graph=p.lambda, out:any[]=[], sa=c.__arg;
    for (let k=0;k<i.arr.length;k++){ c.__arg=i.arr[k]; const v=evalGraph(lam,c,NT); if(v[lam.outNode!][lam.outPort!]) out.push(i.arr[k]); }
    c.__arg=sa; return { v:out };
  } },
  'array.reduce': { kind:'higher', cat:'Array', ins:['arr','init'], outs:['v'], fn:(i,p,s,c)=>{
    const lam:Graph=p.lambda, sa=c.__arg, sc=c.__argAcc; let acc:any=i.init;
    for (let k=0;k<i.arr.length;k++){ c.__arg=i.arr[k]; c.__argAcc=acc; const v=evalGraph(lam,c,NT); acc=v[lam.outNode!][lam.outPort!]; }
    c.__arg=sa; c.__argAcc=sc; return { v:acc };
  } },
  'array.zipWith': { kind:'higher', cat:'Array', ins:['a','b'], outs:['v'], fn:(i,p,s,c)=>{
    const lam:Graph=p.lambda, out:any[]=[], sa=c.__arg, sb=c.__arg2, n=Math.min(i.a.length,i.b.length);
    for (let k=0;k<n;k++){ c.__arg=i.a[k]; c.__arg2=i.b[k]; const v=evalGraph(lam,c,NT); out.push(v[lam.outNode!][lam.outPort!]); }
    c.__arg=sa; c.__arg2=sb; return { v:out };
  } },
  'array.get': { kind:'prim', cat:'Array', ins:['arr','i'], outs:['v'], fn:(i)=>{ const n=i.arr.length; if(!n)return{v:0}; const k=Math.max(0,Math.min(n-1,Math.round(i.i))); return { v:i.arr[k] }; } },
  'array.slice': { kind:'prim', cat:'Array', ins:['arr','i','j'], outs:['v'], fn:(i)=>({ v:i.arr.slice(Math.max(0,Math.floor(i.i)),Math.floor(i.j)) }) },
  'array.window': { kind:'prim', cat:'Array', ins:['arr','i','w'], outs:['v'], fn:(i)=>{ const n=i.arr.length, out:any[]=[], W=Math.max(0,Math.round(i.w)); if(!n)return{v:out}; const s=Math.round(i.i); for(let k=0;k<W;k++)out.push(i.arr[((s+k)%n+n)%n]); return { v:out }; } },
  'array.range': { kind:'prim', cat:'Array', ins:['n'], outs:['v'], fn:(i)=>{ const N=Math.max(0,Math.round(i.n)), out:number[]=[]; for(let k=0;k<N;k++)out.push(k); return { v:out }; } },
  'array.diff': { kind:'prim', cat:'Array', ins:['arr'], outs:['v'], fn:(i)=>{ const out:number[]=[]; for(let k=1;k<i.arr.length;k++)out.push(i.arr[k]-i.arr[k-1]); return { v:out }; } },
  'array.argmax': { kind:'prim', cat:'Array', ins:['arr'], outs:['i'], fn:(i)=>({ i:argmaxArr(i.arr) }) },
  'array.argmin': { kind:'prim', cat:'Array', ins:['arr'], outs:['i'], fn:(i)=>({ i:argmaxArr(i.arr.map((x:number)=>-x)) }) },
  'array.len': { kind:'prim', cat:'Array', ins:['arr'], outs:['v'], fn:(i)=>({ v:i.arr.length }) },
  'array.max': { kind:'prim', cat:'Array', ins:['arr'], outs:['v'], fn:(i)=>({ v:i.arr.length?Math.max.apply(null,i.arr):0 }) },
  'array.min': { kind:'prim', cat:'Array', ins:['arr'], outs:['v'], fn:(i)=>({ v:i.arr.length?Math.min.apply(null,i.arr):0 }) },
  'array.sum': { kind:'prim', cat:'Array', ins:['arr'], outs:['v'], fn:(i)=>({ v:i.arr.reduce((a:number,b:number)=>a+b,0) }) },
  'array.mean': { kind:'prim', cat:'Array', ins:['arr'], outs:['v'], fn:(i)=>({ v:i.arr.length?i.arr.reduce((a:number,b:number)=>a+b,0)/i.arr.length:0 }) },
  'array.sanitizeRanges': { kind:'prim', cat:'Array', ins:['arr','max'], outs:['v'], fn:(i)=>({
    v:i.arr.map((x:number)=>Number.isFinite(x)&&x>0?Math.min(x,i.max):0),
  }) },
  'array.widestAbove': { kind:'prim', cat:'Array', ins:['arr','min'], outs:['i','width'], fn:(i)=>{
    let start=-1, bestStart=0, bestWidth=0;
    for(let k=0;k<=i.arr.length;k++){const open=k<i.arr.length&&i.arr[k]>=i.min;if(open&&start<0)start=k;if(!open&&start>=0){const width=k-start;if(width>bestWidth){bestStart=start;bestWidth=width}start=-1}}
    return { i:bestWidth?bestStart+Math.floor((bestWidth-1)/2):argmaxArr(i.arr), width:bestWidth };
  } },
  'array.pack2': { kind:'prim', cat:'Array', ins:['a','b'], outs:['v'], fn:(i)=>({ v:[i.a,i.b] }) },
  'array.centerMin': { kind:'prim', cat:'Array', ins:['arr','w'], outs:['v'], fn:(i)=>{
    const n=i.arr.length, width=Math.max(1,Math.round(i.w)), lo=Math.max(0,Math.floor(n/2)-Math.floor(width/2));
    return { v:n?Math.min(...i.arr.slice(lo,Math.min(n,lo+width))):0 };
  } },

  // ---- L0 primitives: struct decomposition ----
  'pose.parts': { kind:'prim', cat:'Struct', ins:['pose'], outs:['x','y','yaw'], fn:(i)=>({ x:i.pose.x, y:i.pose.y, yaw:i.pose.yaw }) },
  'wpt.parts': { kind:'prim', cat:'Struct', ins:['waypoint'], outs:['x','y','s','kappa','psi','vref'], fn:(i)=>({
    x:i.waypoint.x, y:i.waypoint.y, s:i.waypoint.s, kappa:i.waypoint.kappa, psi:i.waypoint.psi, vref:i.waypoint.vref,
  }) },

  // ---- L0/L1 boundary: deterministic operations over the provided centerline ----
  'points.empty': { kind:'prim', cat:'Path', outs:['points'], fn:()=>({points:[]}) },
  'points.append': { kind:'prim', cat:'Path', ins:['points','point'], outs:['points'], fn:(i)=>({points:[...i.points,i.point]}) },
  'path.fromPoints': { kind:'prim', cat:'Path', ins:['points','half'], outs:['track'], fn:(i)=>({track:trackFromPoints(i.points,i.half)}) },
  'path.midpoints': { kind:'prim', cat:'Path', ins:['left','right','half'], outs:['track'], fn:(i)=>({track:midpointTrack(i.left,i.right,i.half)}) },
  'path.offset': { kind:'prim', cat:'Path', ins:['track','offset'], outs:['track'], fn:(i)=>({track:offsetTrack(i.track,i.offset)}) },
  'path.resample': { kind:'prim', cat:'Path', ins:['track','spacing'], outs:['track'], fn:(i)=>({track:resampleTrack(i.track,i.spacing)}) },
  'path.nearestIndex': { kind:'prim', cat:'Path', ins:['track','pt'], outs:['i'], fn:(i)=>({ i:nearestIndex(i.track,i.pt.x,i.pt.y,undefined).i }) },
  'path.advanceByDist': { kind:'prim', cat:'Path', ins:['track','i','d'], outs:['pt','i2'], fn:(i)=>{
    const T=i.track;
    if(!T?.N)return { pt:{x:0,y:0}, i2:-1 };
    const ratio=(Number.isFinite(i.d)?i.d:0)/Math.max(T.spacing,1e-9);
    const step=Math.abs(ratio)<1?ratio:Math.round(ratio),raw=(Number.isFinite(i.i)?i.i:0)+step;
    const wrapped=((raw%T.N)+T.N)%T.N, lo=Math.floor(wrapped), hi=(lo+1)%T.N, t=wrapped-lo;
    return { pt:{x:T.pts[lo][0]+(T.pts[hi][0]-T.pts[lo][0])*t,y:T.pts[lo][1]+(T.pts[hi][1]-T.pts[lo][1])*t}, i2:wrapped };
  } },
  'path.at': { kind:'prim', cat:'Path', ins:['track','i'], outs:['waypoint'], fn:(i)=>{
    const T=i.track, k=((Math.round(i.i)%T.N)+T.N)%T.N, p=T.pts[k], t=T.tan[k];
    return { waypoint:{ x:p[0], y:p[1], s:k*T.spacing, kappa:T.curv[k], psi:Math.atan2(t[1],t[0]), vref:0 } };
  } },
  'path.maxCurvature': { kind:'prim', cat:'Path', ins:['track','i','d'], outs:['k'], fn:(i)=>({
    k:curvAheadAt(i.track,Math.round(i.i),i.d),
  }) },

  // ---- shared scene model for rules, learned policies, and optimizers ----
  'object.vehicle': { kind:'prim', cat:'Scene', ins:['pose','velocity','length','width'], outs:['object'], fn:(i)=>({ object:makeVehicleObject(i.pose,i.velocity,Math.max(0,i.length),Math.max(0,i.width)) }) },
  'object.static': { kind:'prim', cat:'Scene', ins:['pose','length','width'], outs:['object'], fn:(i)=>({ object:makeStaticObject(i.pose,Math.max(0,i.length),Math.max(0,i.width)) }) },
  'object.parts': { kind:'prim', cat:'Scene', ins:['object'], outs:['pose','velocity','length','width','speed','dynamic'], fn:(i)=>({
    pose:i.object.pose, velocity:i.object.velocity, length:i.object.shape.length, width:i.object.shape.width,
    speed:Math.hypot(i.object.velocity.x,i.object.velocity.y), dynamic:i.object.kind==='vehicle',
  }) },
  'object.relative': { kind:'prim', cat:'Scene', ins:['object','pose'], outs:['e','d'], fn:(i)=>relativeObject(i.object,i.pose) },
  'objects.empty': { kind:'prim', cat:'Scene', outs:['objects'], fn:()=>({ objects:[] }) },
  'objects.append': { kind:'prim', cat:'Scene', ins:['objects','object'], outs:['objects'], fn:(i)=>({ objects:[...i.objects,i.object] }) },
  'objects.nearest': { kind:'prim', cat:'Scene', ins:['objects','pose'], outs:['object','d','found'], fn:(i)=>nearestObject(i.objects,i.pose) },
  'objects.inRadius': { kind:'prim', cat:'Scene', ins:['objects','pose','radius'], outs:['objects'], fn:(i)=>({ objects:objectsInRadius(i.objects,i.pose,Math.max(0,i.radius)) }) },

  // ---- drivable-space representation: track bounds minus obstacle occupancy ----
  'corridor.fromTrack': { kind:'prim', cat:'Space', ins:['track','speedLimit'], outs:['corridor'], fn:(i)=>({ corridor:corridorFromTrack(i.track,Math.max(0,i.speedLimit)) }) },
  'space.fromTrack': { kind:'prim', cat:'Space', ins:['track','speedLimit'], outs:['space'], fn:(i)=>({ space:spaceFromTrack(i.track,Math.max(0,i.speedLimit)) }) },
  'space.blockObject': { kind:'prim', cat:'Space', ins:['space','object','margin'], outs:['space'], fn:(i)=>({ space:blockObject(i.space,i.object,Math.max(0,i.margin)) }) },
  'space.contains': { kind:'prim', cat:'Space', ins:['space','pt'], outs:['inside'], fn:(i)=>({ inside:spaceContains(i.space,i.pt) }) },

  // ---- state and trajectory candidates ----
  'state.parts': { kind:'prim', cat:'Struct', ins:['state'], outs:['pose','velocity','speed','yawRate','onTrack'], fn:(i)=>({
    pose:{x:i.state.x,y:i.state.y,yaw:i.state.yaw}, velocity:{x:i.state.vx,y:i.state.vy}, speed:i.state.v, yawRate:i.state.r, onTrack:i.state.onTrack,
  }) },
  'command.make': { kind:'prim', cat:'Struct', ins:['steer','throttle'], outs:['command'], fn:(i)=>({ command:{steer:Math.max(-1,Math.min(1,i.steer)),throttle:Math.max(-1,Math.min(1,i.throttle))} }) },
  'commands.steerLattice': { kind:'prim', cat:'Trajectory', ins:['baseSteer','throttle','span','count'], outs:['commands'], fn:(i)=>{ const n=Math.max(1,Math.min(41,Math.round(i.count))),span=Math.max(0,i.span); return { commands:Array.from({length:n},(_,k)=>({steer:Math.max(-1,Math.min(1,i.baseSteer+(n===1?0:(k/(n-1)*2-1)*span))),throttle:Math.max(-1,Math.min(1,i.throttle))})) }; } },
  'commands.empty': { kind:'prim', cat:'Trajectory', outs:['commands'], fn:()=>({commands:[]}) },
  'commands.append': { kind:'prim', cat:'Trajectory', ins:['commands','command'], outs:['commands'], fn:(i)=>({commands:[...i.commands,i.command]}) },
  'command.parts': { kind:'prim', cat:'Struct', ins:['command'], outs:['steer','throttle'], fn:(i)=>({ steer:i.command?.steer??0, throttle:i.command?.throttle??0 }) },
  'trajectories.rolloutLattice': { kind:'prim', cat:'Trajectory', ins:['state','commands','horizon','step'], outs:['trajectories'], fn:(i,p,s,c)=>({trajectories:i.commands.map((command:any)=>rolloutTrajectory(i.state,command,Math.max(0,i.horizon),Math.max(1/240,i.step),c.world))}) },
  'trajectory.rolloutCommands': { kind:'prim', cat:'Trajectory', ins:['state','commands','step'], outs:['trajectory'], fn:(i,p,s,c)=>({trajectory:rolloutCommandSequence(i.state,i.commands,Math.max(1/240,i.step),c.world)}) },
  'trajectory.rollout': { kind:'prim', cat:'Trajectory', ins:['state','command','horizon','step'], outs:['trajectory'], fn:(i,p,s,c)=>({ trajectory:rolloutTrajectory(i.state,i.command,Math.max(0,i.horizon),Math.max(1/240,i.step),c.world) }) },
  'trajectory.parts': { kind:'prim', cat:'Trajectory', ins:['trajectory'], outs:['duration','length','valid'], fn:(i)=>({ duration:i.trajectory.duration, length:i.trajectory.points.length, valid:i.trajectory.valid }) },
  'trajectory.clearance': { kind:'prim', cat:'Trajectory', ins:['trajectory','objects'], outs:['d'], fn:(i)=>({ d:trajectoryClearance(i.trajectory,i.objects) }) },
  'trajectory.progress': { kind:'prim', cat:'Trajectory', ins:['trajectory','track'], outs:['d'], fn:(i)=>({ d:trajectoryProgress(i.trajectory,i.track) }) },
  'trajectory.collides': { kind:'prim', cat:'Trajectory', ins:['trajectory','objects','margin'], outs:['collision'], fn:(i)=>({ collision:trajectoryClearance(i.trajectory,i.objects)<Math.max(0,i.margin) }) },
  'trajectories.empty': { kind:'prim', cat:'Trajectory', outs:['trajectories'], fn:()=>({ trajectories:[] }) },
  'trajectories.append': { kind:'prim', cat:'Trajectory', ins:['trajectories','trajectory'], outs:['trajectories'], fn:(i)=>({ trajectories:[...i.trajectories,i.trajectory] }) },
  'trajectories.evaluate': { kind:'prim', cat:'Cost', ins:['trajectories','request','objects','predictions'], outs:['costs','valids','breakdowns','violationSets'], fn:(i)=>{ const results=i.trajectories.map((trajectory:any)=>evaluateTrajectory(trajectory,i.request,i.objects,i.predictions)); return {costs:results.map((r:any)=>r.cost),valids:results.map((r:any)=>r.valid),breakdowns:results.map((r:any)=>r.breakdown),violationSets:results.map((r:any)=>r.violations)} } },
  'trajectories.selectEvaluated': { kind:'prim', cat:'Trajectory', ins:['trajectories','costs','valids'], outs:['trajectory','i'], fn:(i)=>selectMinTrajectory(i.trajectories,i.costs.map((cost:number,k:number)=>i.valids[k]?cost:Infinity)) },
  'trajectories.selectMin': { kind:'prim', cat:'Trajectory', ins:['trajectories','costs'], outs:['trajectory','i'], fn:(i)=>selectMinTrajectory(i.trajectories,i.costs) },
  'trajectory.commandAt': { kind:'prim', cat:'Trajectory', ins:['trajectory','i'], outs:['command'], fn:(i)=>{
    const points=i.trajectory?.points??[];
    if(!points.length)return { command:{steer:0,throttle:0} };
    const requested=Number.isFinite(i.i)?Math.round(i.i):0;
    const k=Math.max(0,Math.min(points.length-1,requested));
    return { command:{...points[k].command} };
  } },

  // ---- short-horizon prediction remains separate from planning ----
  'predict.constantVelocity': { kind:'prim', cat:'Prediction', ins:['object','horizon','step'], outs:['prediction'], fn:(i)=>({ prediction:predictConstantVelocity(i.object,Math.max(0,i.horizon),Math.max(1/30,i.step)) }) },
  'predictions.empty': { kind:'prim', cat:'Prediction', outs:['predictions'], fn:()=>({ predictions:[] }) },
  'predictions.append': { kind:'prim', cat:'Prediction', ins:['predictions','prediction'], outs:['predictions'], fn:(i)=>({ predictions:[...i.predictions,i.prediction] }) },
  'prediction.clearance': { kind:'prim', cat:'Prediction', ins:['trajectory','predictions'], outs:['d'], fn:(i)=>({ d:predictionClearance(i.trajectory,i.predictions) }) },

  // ---- behavior intent: named decisions, not turnkey driving algorithms ----
  'intent.follow': { kind:'prim', cat:'Behavior', ins:['targetSpeed','offset','commit'], outs:['intent'], fn:(i)=>({ intent:makeIntent('follow',Math.max(0,i.targetSpeed),i.offset,Math.max(0,i.commit)) }) },
  'intent.avoid': { kind:'prim', cat:'Behavior', ins:['target','targetSpeed','offset','commit'], outs:['intent'], fn:(i)=>({ intent:makeIntent('avoid',Math.max(0,i.targetSpeed),i.offset,Math.max(0,i.commit),i.target) }) },
  'intent.passLeft': { kind:'prim', cat:'Behavior', ins:['target','targetSpeed','offset','commit'], outs:['intent'], fn:(i)=>({ intent:makeIntent('pass-left',Math.max(0,i.targetSpeed),Math.abs(i.offset),Math.max(0,i.commit),i.target) }) },
  'intent.passRight': { kind:'prim', cat:'Behavior', ins:['target','targetSpeed','offset','commit'], outs:['intent'], fn:(i)=>({ intent:makeIntent('pass-right',Math.max(0,i.targetSpeed),-Math.abs(i.offset),Math.max(0,i.commit),i.target) }) },
  'intent.emergency': { kind:'prim', cat:'Behavior', ins:['commit'], outs:['intent'], fn:(i)=>({ intent:makeIntent('emergency-stop',0,0,Math.max(0,i.commit)) }) },
  'intent.parts': { kind:'prim', cat:'Behavior', ins:['intent'], outs:['mode','targetSpeed','offset','commit','priority'], fn:(i)=>({ mode:i.intent.mode, targetSpeed:i.intent.targetSpeed, offset:i.intent.targetOffset, commit:i.intent.commitUntil, priority:i.intent.priority }) },


  // ---- composable objective and feasibility terms for local planning ----
  'cost.progress': { kind:'prim', cat:'Cost', ins:['weight'], outs:['cost'], fn:(i)=>({ cost:{kind:'progress',weight:i.weight,params:{}} as CostTerm }) },
  'cost.collision': { kind:'prim', cat:'Cost', ins:['weight','margin'], outs:['cost'], fn:(i)=>({ cost:{kind:'collision',weight:i.weight,params:{margin:Math.max(0,i.margin)}} as CostTerm }) },
  'cost.clearance': { kind:'prim', cat:'Cost', ins:['weight','floor'], outs:['cost'], fn:(i)=>({ cost:{kind:'clearance',weight:i.weight,params:{floor:Math.max(0.01,i.floor)}} as CostTerm }) },
  'cost.tracking': { kind:'prim', cat:'Cost', ins:['weight'], outs:['cost'], fn:(i)=>({ cost:{kind:'tracking',weight:i.weight,params:{}} as CostTerm }) },
  'cost.smoothness': { kind:'prim', cat:'Cost', ins:['weight'], outs:['cost'], fn:(i)=>({ cost:{kind:'smoothness',weight:i.weight,params:{}} as CostTerm }) },
  'cost.control': { kind:'prim', cat:'Cost', ins:['weight'], outs:['cost'], fn:(i)=>({ cost:{kind:'control',weight:i.weight,params:{}} as CostTerm }) },
  'costs.empty': { kind:'prim', cat:'Cost', outs:['costs'], fn:()=>({ costs:[] }) },
  'costs.append': { kind:'prim', cat:'Cost', ins:['costs','cost'], outs:['costs'], fn:(i)=>({ costs:[...i.costs,i.cost] }) },
  'constraint.track': { kind:'prim', cat:'Constraint', ins:['margin'], outs:['constraint'], fn:(i)=>({ constraint:{kind:'track',hard:true,params:{margin:Math.max(0,i.margin)}} as Constraint }) },
  'constraint.collision': { kind:'prim', cat:'Constraint', ins:['margin'], outs:['constraint'], fn:(i)=>({ constraint:{kind:'collision',hard:true,params:{margin:Math.max(0,i.margin)}} as Constraint }) },
  'constraint.speed': { kind:'prim', cat:'Constraint', ins:['max'], outs:['constraint'], fn:(i)=>({ constraint:{kind:'speed',hard:true,params:{max:Math.max(0,i.max)}} as Constraint }) },
  'constraint.steer': { kind:'prim', cat:'Constraint', ins:['max'], outs:['constraint'], fn:(i)=>({ constraint:{kind:'steer',hard:true,params:{max:Math.max(0,i.max)}} as Constraint }) },
  'constraints.empty': { kind:'prim', cat:'Constraint', outs:['constraints'], fn:()=>({ constraints:[] }) },
  'constraints.append': { kind:'prim', cat:'Constraint', ins:['constraints','constraint'], outs:['constraints'], fn:(i)=>({ constraints:[...i.constraints,i.constraint] }) },
  'request.make': { kind:'prim', cat:'Behavior', ins:['intent','track','costs','constraints'], outs:['request'], fn:(i)=>({ request:requestFromIntent(i.intent,i.track,i.costs,i.constraints) }) },
  'request.parts': { kind:'prim', cat:'Behavior', ins:['request'], outs:['targetSpeed','offset','costs','constraints'], fn:(i)=>({
    targetSpeed:i.request.targetSpeed, offset:i.request.preferredOffset, costs:i.request.costs, constraints:i.request.constraints,
  }) },
  'trajectory.evaluate': { kind:'prim', cat:'Cost', ins:['trajectory','request','objects','predictions'], outs:['cost','valid','clearance','breakdown','violations'], fn:(i)=>evaluateTrajectory(i.trajectory,i.request,i.objects,i.predictions) },

  // vec2 decomposition — reusable geometry primitives so any car-frame vector can be opened
  'vec.make': { kind:'prim', cat:'Vector', ins:['x','y'], outs:['e'], fn:(i)=>({ e:{ x:i.x, y:i.y } }) },
  'vec.xy':  { kind:'prim', cat:'Vector', ins:['e'], outs:['x','y'], fn:(i)=>({ x:i.e.x, y:i.e.y }) },
  'vec.len': { kind:'prim', cat:'Vector', ins:['e'], outs:['v'], fn:(i)=>({ v:Math.hypot(i.e.x,i.e.y) }) },
  'vec.scale': { kind:'prim', cat:'Vector', ins:['e','s'], outs:['e'], fn:(i)=>({ e:{ x:i.e.x*i.s, y:i.e.y*i.s } }) },
  'vec.add': { kind:'prim', cat:'Vector', ins:['a','b'], outs:['e'], fn:(i)=>({ e:{ x:i.a.x+i.b.x, y:i.a.y+i.b.y } }) },
  'vec.sub': { kind:'prim', cat:'Vector', ins:['a','b'], outs:['e'], fn:(i)=>({ e:{ x:i.a.x-i.b.x, y:i.a.y-i.b.y } }) },
  'vec.dot': { kind:'prim', cat:'Vector', ins:['a','b'], outs:['v'], fn:(i)=>({ v:i.a.x*i.b.x+i.a.y*i.b.y }) },
  'vec.normalize': { kind:'prim', cat:'Vector', ins:['e'], outs:['e'], fn:(i)=>{ const L=Math.hypot(i.e.x,i.e.y)||1e-6; return { e:{ x:i.e.x/L, y:i.e.y/L } }; } },
  'vec.rotate': { kind:'prim', cat:'Vector', ins:['e','th'], outs:['e'], fn:(i)=>{ const c=Math.cos(i.th), s=Math.sin(i.th); return { e:{ x:c*i.e.x-s*i.e.y, y:s*i.e.x+c*i.e.y } }; } },
  'vec.angle': { kind:'prim', cat:'Vector', ins:['e'], outs:['v'], fn:(i)=>({ v:Math.atan2(i.e.y,i.e.x) }) },
  'vec.dist': { kind:'prim', cat:'Vector', ins:['a','b'], outs:['v'], fn:(i)=>({ v:Math.hypot(i.a.x-i.b.x,i.a.y-i.b.y) }) },

  // ---- L1 standard library: shipped, openable composites ----
  'ctrl.pursuit': composite('Control', ['pose','track','Ld'], ['steer'], PURSUIT_CTRL_SUB, { steer:['steer','v'] }),
  'ctrl.speed': composite('Control', ['speed','target'], ['throttle'], SPEED_CTRL_SUB, { throttle:['throttle','v'] }),
  'std.lookahead': composite('Geometry', ['pose','track','Ld'], ['pt','idx'], LOOKAHEAD_SUB, { pt:['ahead','pt'], idx:['nearest','i'] }),
  'std.tocar': composite('Geometry', ['pt','pose'], ['e'], TOCAR_SUB, { e:['local','e'] }),
  'std.curvAhead': composite('Geometry', ['pose','track'], ['k'], CURVAHEAD_SUB, { k:['curve','k'] }),
  'std.gripSpeed': composite('Planning', ['k'], ['v'], GRIPSPEED_SUB, { v:['limited','v'] }),
  'std.nearestWpt': composite('Geometry', ['track','pt'], ['waypoint','i'], NEAREST_WPT_SUB, { waypoint:['waypoint','waypoint'], i:['nearest','i'] }),
  'std.crossTrack': composite('Geometry', ['pose','track'], ['e'], CROSS_TRACK_SUB, { e:['error','v'] }),
  'std.headingErr': composite('Geometry', ['pose','track'], ['e'], HEADING_ERR_SUB, { e:['error','v'] }),
  'lidar.widestGap': composite('LiDAR', ['ranges'], ['i'], WIDEST_GAP_SUB, { i:['widest','i'] }),
  'lidar.preprocess': composite('LiDAR', ['ranges'], ['ranges'], LIDAR_PREPROCESS_SUB, { ranges:['clean','v'] }),
  'lidar.freeAhead': composite('LiDAR', ['ranges'], ['d'], FREE_AHEAD_SUB, { d:['clear','v'] }),

  'ctrl.pid': composite('Control', ['err'], ['u'], PID_SUB, { u:['u','v'] }),

  // ---- L0 primitives: stateful (deterministic; state resets to 0). Cycles MUST pass through these. ----
  'st.pidIntegral': { kind:'std', cat:'State', ins:['x'], outs:['v'], fn:(i,p,s,c)=>{ s.v=Math.max(-6,Math.min(6,(s.v||0)+i.x*c.dt)); return { v:s.v }; } },
  'st.pidDerivative': { kind:'std', cat:'State', ins:['x'], outs:['v'], fn:(i,p,s,c)=>{ const prev=s.prev||0; s.prev=i.x; return { v:(i.x-prev)/Math.max(c.dt,1e-9) }; } },
  'st.delay': { kind:'std', cat:'State', ins:['x'], outs:['v'], fn:(i,p,s)=>{ const prev=s.prev??0; s.prev=i.x; return { v:prev }; } },
  'st.accum': { kind:'std', cat:'State', ins:['x'], outs:['v'], fn:(i,p,s,c)=>{ s.acc=(s.acc||0)+i.x*c.dt; return { v:s.acc }; } },
  'st.lowpass': { kind:'std', cat:'State', ins:['x'], outs:['v'], fn:(i,p,s)=>{ const a=p.alpha??0.1; s.y=(s.y==null)?i.x:a*i.x+(1-a)*s.y; return { v:s.y }; } },
  'st.rateLimit': { kind:'std', cat:'State', ins:['x'], outs:['v'], fn:(i,p,s,c)=>{ const lim=(p.rate??1)*c.dt; const prev=s.y==null?i.x:s.y; s.y=prev+Math.max(-lim,Math.min(lim,i.x-prev)); return { v:s.y }; } },

  // ---- composite input placeholder (used only inside block sub-graphs) ----
  'cin': { kind:'prim', cat:'Composite', outs:['v'], fn:(i,p,s,c)=>({ v:(c.__cin||{})[p.port] }) },
  'cparam': { kind:'prim', cat:'Composite', outs:['v'], fn:(i,p,s,c)=>({ v:(c.__cparams||{})[p.param] ?? p.fallback }) },

  // ---- Modules: prior-mission controllers provided as openable blocks (P-b) ----
  'blk.pursuit': composite('Module', [], ['steer'], PURSUIT_SUB, { steer:['steer','v'] }),
  'blk.speedPid': composite('Module', ['target'], ['throttle'], SPEEDPID_SUB, { throttle:['thr','v'] }),
  'policy.linear2': composite('Policy', ['x1','x2'], ['action'], LINEAR_POLICY_SUB, { action:['action','v'] }),
  'reward.track': composite('Reward', ['speed','cte','onTrack'], ['reward'], TRACK_REWARD_SUB, { reward:['reward','v'] }),
  // user-made block (encapsulation): inner sub-graph + outMap carried on params
  'blk.user': { kind:'composite', cat:'Module', fn:(inv,p,st,ctx)=>{
    const sub:Graph=p.sub, outMap:Record<string,[string,string]>=p.outMap||{};
    const savedCin=ctx.__cin, savedParams=ctx.__cparams, savedState=ctx.state;
    ctx.__cin=inv; ctx.__cparams=p; ctx.state=(st.__inner ||= {});
    const v=evalGraph(sub,ctx,NT);
    ctx.__cin=savedCin; ctx.__cparams=savedParams; ctx.state=savedState;
    const o:Record<string,any>={}; for (const k in outMap) o[k]=v[outMap[k][0]]?.[outMap[k][1]];
    o.__inner=v;
    return o;
  } },

  // ---- hooks (reserved for MPPI/MPC/RL) ----
  'rng.uniform': { kind:'prim', cat:'Random', ins:['lo','hi'], outs:['v'], fn:(i,p,s,c)=>({ v:uniform(c.rng, i.lo??0, i.hi??1) }) },
  'rng.gauss':   { kind:'prim', cat:'Random', outs:['v'], fn:(i,p,s,c)=>({ v:gaussian(c.rng) }) },
  // model-as-node: predict next (x,y,speed) given a control from the CURRENT car state
  'sim.predict': { kind:'builtin', cat:'Model', ins:['steer','throttle'], outs:['x','y','v'], fn:(i,p,s,c)=>{
    const nx=stepVehicle(c.car, { steer:i.steer, throttle:i.throttle }, c.world, c.dt); return { x:nx.x, y:nx.y, v:nx.vx };
  } },

  // ---- sinks (write command) — coerce unwired/NaN inputs to 0 so a partial graph is safe ----
  'sink.steer':    { kind:'sink', cat:'Output', ins:['x'], fn:(i,p,s,c)=>{ c.cmd.steer=Number.isFinite(i.x)?i.x:0; return {}; } },
  'sink.throttle': { kind:'sink', cat:'Output', ins:['x'], fn:(i,p,s,c)=>{ c.cmd.throttle=Number.isFinite(i.x)?i.x:0; return {}; } },
  'sink.reward': { kind:'metric', cat:'Reward', ins:['x'], outs:['value'], fn:(i,p,s,c)=>{ (c.metrics??={}).reward=Number.isFinite(i.x)?i.x:0; return {value:(c.metrics.reward as number)} } },
};
