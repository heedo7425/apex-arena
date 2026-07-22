// Node registry: L0 primitives, L1 standard library, sources/sinks,
// plus reserved hooks (rng.uniform, sim.predict) for MPPI/MPC/RL.
import { type NodeDef, type EvalCtx, type Graph, evalGraph, makeGraph } from './engine.ts';
import { nearestIndex, curvAheadAt, G } from '../sim/world.ts';
import { stepDynamics } from '../sim/vehicle.ts';
import { uniform, gaussian } from '../rng.ts';

function argmaxArr(a: number[]): number { let bi = 0, bv = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > bv) { bv = a[i]; bi = i; } return bi; }

// ---- composite node: a shipped/user block = an inner sub-graph (openable, forkable) ----
// Inner nodes read the block's inputs via `cin` (composite-in); state is namespaced per instance.
function composite(cat: string, ins: string[], outs: string[], sub: Graph, outMap: Record<string, [string, string]>): NodeDef {
  return { kind:'composite', cat, ins, outs, sub, outMap, fn:(inv,p,st,ctx)=>{
    const savedCin=ctx.__cin, savedState=ctx.state;
    ctx.__cin=inv; ctx.state=(st.__inner ||= {});
    const v=evalGraph(sub,ctx,NT);
    ctx.__cin=savedCin; ctx.state=savedState;
    const o:Record<string,any>={}; for (const k in outMap) o[k]=v[outMap[k][0]]?.[outMap[k][1]];
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

export const NT: Record<string, NodeDef> = {
  // ---- sources (read observation) ----
  'src.scan':  { kind:'source', cat:'Sensors', outs:['ranges','a0','da'], fn:(i,p,s,c)=>{ const sc:any=c.obs.scan; return { ranges:sc.ranges, a0:sc.a0, da:sc.da }; } },
  'src.speed': { kind:'source', cat:'Sensors', outs:['v'], fn:(i,p,s,c)=>({ v:c.obs.speed }) },
  'src.pose':  { kind:'source', cat:'Sensors', outs:['pose'], fn:(i,p,s,c)=>({ pose:c.obs.pose }) },
  'src.track': { kind:'source', cat:'Sensors', outs:['track'], fn:(i,p,s,c)=>({ track:c.obs.track }) },

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

  // ---- L0 primitives: struct decomposition ----
  'pose.parts': { kind:'prim', cat:'Struct', ins:['pose'], outs:['x','y','yaw'], fn:(i)=>({ x:i.pose.x, y:i.pose.y, yaw:i.pose.yaw }) },
  'wpt.parts': { kind:'prim', cat:'Struct', ins:['waypoint'], outs:['x','y','s','kappa','psi','vref'], fn:(i)=>({
    x:i.waypoint.x, y:i.waypoint.y, s:i.waypoint.s, kappa:i.waypoint.kappa, psi:i.waypoint.psi, vref:i.waypoint.vref,
  }) },

  // ---- L0/L1 boundary: deterministic operations over the provided centerline ----
  'path.nearestIndex': { kind:'prim', cat:'Path', ins:['track','pt'], outs:['i'], fn:(i)=>({ i:nearestIndex(i.track,i.pt.x,i.pt.y,undefined).i }) },
  'path.advanceByDist': { kind:'prim', cat:'Path', ins:['track','i','d'], outs:['pt','i2'], fn:(i)=>{
    const T=i.track, steps=Math.max(1,Math.round(i.d/T.spacing));
    const i2=((Math.round(i.i)+steps)%T.N+T.N)%T.N;
    return { pt:{x:T.pts[i2][0],y:T.pts[i2][1]}, i2 };
  } },

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
  'std.lookahead': composite('Geometry', ['pose','track','Ld'], ['pt','idx'], LOOKAHEAD_SUB, { pt:['ahead','pt'], idx:['nearest','i'] }),
  'std.tocar': composite('Geometry', ['pt','pose'], ['e'], TOCAR_SUB, { e:['local','e'] }),
  'std.curvAhead': { kind:'std', cat:'Geometry', ins:['pose','track'], outs:['k'], fn:(i,p,s,c)=>{
    const idx=nearestIndex(c.world.track,i.pose.x,i.pose.y,undefined).i; return { k:curvAheadAt(c.world.track,idx,18) };
  } },
  'std.gripSpeed': { kind:'std', cat:'Planning', ins:['k'], outs:['v'], fn:(i,p,s,c)=>({ v:Math.min(p.vmax,Math.sqrt(c.world.mu*G/Math.max(i.k,0.004))*p.margin) }) },
  'ctrl.pid': { kind:'std', cat:'Control', ins:['err'], outs:['u'], fn:(i,p,s)=>{
    s.int=Math.max(-6,Math.min(6,(s.int||0)+i.err*(1/120))); const d=(i.err-(s.prev||0))*120; s.prev=i.err;
    return { u:p.kp*i.err + (p.ki||0)*s.int + (p.kd||0)*d };
  } },

  // ---- L0 primitives: stateful (deterministic; state resets to 0). Cycles MUST pass through these. ----
  'st.delay': { kind:'std', cat:'State', ins:['x'], outs:['v'], fn:(i,p,s)=>{ const prev=s.prev??0; s.prev=i.x; return { v:prev }; } },
  'st.accum': { kind:'std', cat:'State', ins:['x'], outs:['v'], fn:(i,p,s,c)=>{ s.acc=(s.acc||0)+i.x*c.dt; return { v:s.acc }; } },
  'st.lowpass': { kind:'std', cat:'State', ins:['x'], outs:['v'], fn:(i,p,s)=>{ const a=p.alpha??0.1; s.y=(s.y==null)?i.x:a*i.x+(1-a)*s.y; return { v:s.y }; } },
  'st.rateLimit': { kind:'std', cat:'State', ins:['x'], outs:['v'], fn:(i,p,s,c)=>{ const lim=(p.rate??1)*c.dt; const prev=s.y==null?i.x:s.y; s.y=prev+Math.max(-lim,Math.min(lim,i.x-prev)); return { v:s.y }; } },

  // ---- composite input placeholder (used only inside block sub-graphs) ----
  'cin': { kind:'prim', cat:'Composite', outs:['v'], fn:(i,p,s,c)=>({ v:(c.__cin||{})[p.port] }) },

  // ---- Modules: prior-mission controllers provided as openable blocks (P-b) ----
  'blk.pursuit': composite('Module', [], ['steer'], PURSUIT_SUB, { steer:['steer','v'] }),
  'blk.speedPid': composite('Module', ['target'], ['throttle'], SPEEDPID_SUB, { throttle:['thr','v'] }),
  // user-made block (encapsulation): inner sub-graph + outMap carried on params
  'blk.user': { kind:'composite', cat:'Module', fn:(inv,p,st,ctx)=>{
    const sub:Graph=p.sub, outMap:Record<string,[string,string]>=p.outMap||{};
    const savedCin=ctx.__cin, savedState=ctx.state;
    ctx.__cin=inv; ctx.state=(st.__inner ||= {});
    const v=evalGraph(sub,ctx,NT);
    ctx.__cin=savedCin; ctx.state=savedState;
    const o:Record<string,any>={}; for (const k in outMap) o[k]=v[outMap[k][0]]?.[outMap[k][1]];
    return o;
  } },

  // ---- hooks (reserved for MPPI/MPC/RL) ----
  'rng.uniform': { kind:'prim', cat:'Random', ins:['lo','hi'], outs:['v'], fn:(i,p,s,c)=>({ v:uniform(c.rng, i.lo??0, i.hi??1) }) },
  'rng.gauss':   { kind:'prim', cat:'Random', outs:['v'], fn:(i,p,s,c)=>({ v:gaussian(c.rng) }) },
  // model-as-node: predict next (x,y,speed) given a control from the CURRENT car state
  'sim.predict': { kind:'builtin', cat:'Model', ins:['steer','throttle'], outs:['x','y','v'], fn:(i,p,s,c)=>{
    const nx=stepDynamics(c.car, { steer:i.steer, throttle:i.throttle }, c.world, c.dt); return { x:nx.x, y:nx.y, v:nx.vx };
  } },

  // ---- sinks (write command) — coerce unwired/NaN inputs to 0 so a partial graph is safe ----
  'sink.steer':    { kind:'sink', cat:'Output', ins:['x'], fn:(i,p,s,c)=>{ c.cmd.steer=Number.isFinite(i.x)?i.x:0; return {}; } },
  'sink.throttle': { kind:'sink', cat:'Output', ins:['x'], fn:(i,p,s,c)=>{ c.cmd.throttle=Number.isFinite(i.x)?i.x:0; return {}; } },
};
