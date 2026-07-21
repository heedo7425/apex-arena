// Node registry: L0 primitives, L1 standard library, sources/sinks,
// plus reserved hooks (rng.uniform, sim.predict) for MPPI/MPC/RL.
import { type NodeDef, type EvalCtx, type Graph, evalGraph } from './engine.ts';
import { nearestIndex, curvAheadAt, G } from '../sim/world.ts';
import { stepDynamics } from '../sim/vehicle.ts';
import { uniform, gaussian } from '../rng.ts';

function argmaxArr(a: number[]): number { let bi = 0, bv = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > bv) { bv = a[i]; bi = i; } return bi; }

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

  // ---- L1 standard library (shipped composites; here as builtins for now) ----
  'std.lookahead': { kind:'std', cat:'Geometry', ins:['pose','track','Ld'], outs:['pt','idx'], fn:(i,p,s,c)=>{
    const T=c.world.track, idx=nearestIndex(T,i.pose.x,i.pose.y,undefined).i, steps=Math.max(1,Math.round(i.Ld/T.spacing)), t=(idx+steps)%T.N;
    return { pt:{x:T.pts[t][0],y:T.pts[t][1]}, idx };
  } },
  'std.tocar': { kind:'std', cat:'Geometry', ins:['pt','pose'], outs:['e'], fn:(i)=>{
    const dx=i.pt.x-i.pose.x, dy=i.pt.y-i.pose.y, cs=Math.cos(i.pose.yaw), sn=Math.sin(i.pose.yaw);
    return { e:{ x:cs*dx+sn*dy, y:-sn*dx+cs*dy } };
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
