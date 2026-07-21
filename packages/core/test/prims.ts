// Unit checks for P-a L0 primitives (math / logic / vector / array / stateful).
import { makeGraph, evalGraph, type EvalCtx } from '../src/graph/engine.ts';
import { NT } from '../src/graph/registry.ts';
import { buildWorld, G } from '../src/sim/world.ts';
import { makeRng } from '../src/rng.ts';

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
