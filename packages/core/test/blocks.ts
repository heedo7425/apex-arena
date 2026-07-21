// Composite blocks (blk.pursuit / blk.speedPid) must drive identically to the
// equivalent inline primitive graph — proving encapsulation is behavior-preserving.
import { makeGraph } from '../src/graph/engine.ts';
import { buildWorld } from '../src/sim/world.ts';
import { runFor, medalFor } from '../src/sim/runner.ts';
import { NT } from '../src/graph/registry.ts';

let failed = 0;
function ok(cond: boolean, msg: string) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; }
const world = buildWorld();

// Inline L3 solution: full pursuit steering + curvature-aware speed PID, all primitives.
const INLINE = makeGraph({
  pose:{type:'src.pose'}, track:{type:'src.track'}, speed:{type:'src.speed'},
  Ld:{type:'const',params:{value:6}},
  look:{type:'std.lookahead',in:{pose:['n','pose','pose'],track:['n','track','track'],Ld:['n','Ld','v']}},
  e:{type:'std.tocar',in:{pt:['n','look','pt'],pose:['n','pose','pose']}},
  comp:{type:'vec.xy',in:{e:['n','e','e']}}, dist:{type:'vec.len',in:{e:['n','e','e']}},
  two:{type:'const',params:{value:2}}, twoY:{type:'mul',in:{a:['n','two','v'],b:['n','comp','y']}},
  dsq:{type:'mul',in:{a:['n','dist','v'],b:['n','dist','v']}}, k:{type:'div',in:{a:['n','twoY','v'],b:['n','dsq','v']}},
  gain:{type:'const',params:{value:5.2}}, sraw:{type:'mul',in:{a:['n','k','v'],b:['n','gain','v']}},
  steer:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','sraw','v']}}, ssink:{type:'sink.steer',in:{x:['n','steer','v']}},
  curve:{type:'std.curvAhead',in:{pose:['n','pose','pose'],track:['n','track','track']}},
  grip:{type:'std.gripSpeed',params:{vmax:13,margin:0.85},in:{k:['n','curve','k']}},
  verr:{type:'sub',in:{a:['n','grip','v'],b:['n','speed','v']}},
  pid:{type:'ctrl.pid',params:{kp:0.6,ki:0.06,kd:0},in:{err:['n','verr','v']}},
  thr:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','pid','u']}}, tsink:{type:'sink.throttle',in:{x:['n','thr','v']}},
});

// Block L3 solution: prior work encapsulated, player only wires curvature -> grip -> target.
const BLOCKS = makeGraph({
  steerctl:{type:'blk.pursuit'}, ssink:{type:'sink.steer',in:{x:['n','steerctl','steer']}},
  pose:{type:'src.pose'}, track:{type:'src.track'},
  curve:{type:'std.curvAhead',in:{pose:['n','pose','pose'],track:['n','track','track']}},
  grip:{type:'std.gripSpeed',params:{vmax:13,margin:0.85},in:{k:['n','curve','k']}},
  speedctl:{type:'blk.speedPid',in:{target:['n','grip','v']}}, tsink:{type:'sink.throttle',in:{x:['n','speedctl','throttle']}},
});

ok(NT['blk.pursuit'].kind === 'composite' && !!NT['blk.pursuit'].sub, 'blk.pursuit is an openable composite (has .sub)');
ok(NT['blk.speedPid'].kind === 'composite' && !!NT['blk.speedPid'].sub, 'blk.speedPid is an openable composite (has .sub)');

const inl = runFor(world, INLINE, 1, 70);
const blk = runFor(world, BLOCKS, 1, 70);
console.log('INLINE:', 'bestClean=' + (inl.bestClean?.toFixed(4) ?? '--'), 'medal=' + medalFor(inl.bestClean));
console.log('BLOCKS:', 'bestClean=' + (blk.bestClean?.toFixed(4) ?? '--'), 'medal=' + medalFor(blk.bestClean));
ok(!blk.nan, 'BLOCKS graph drives with no NaN');
ok(blk.bestClean !== null, 'BLOCKS completes a clean lap');
ok(inl.bestClean === blk.bestClean, 'blocks lap === inline lap (behavior-preserving encapsulation)');

// determinism through composites
const a = runFor(world, BLOCKS, 42, 40), b = runFor(world, BLOCKS, 42, 40);
ok(a.bestClean === b.bestClean, 'composite graph deterministic (same seed → identical)');

// fork (inline) both blocks -> must still drive identically to the block version
import { inlineComposite } from '../src/graph/inline.ts';
let forked = inlineComposite(BLOCKS, 'steerctl', NT);
forked = inlineComposite(forked, 'speedctl', NT);
const noBlocks = Object.values(forked.nodes).every(n => n.type !== 'blk.pursuit' && n.type !== 'blk.speedPid' && n.type !== 'cin');
ok(noBlocks, 'fork inlines blocks away (no blk.* / cin left)');
const fk = runFor(world, forked, 1, 70);
console.log('FORKED:', 'bestClean=' + (fk.bestClean?.toFixed(4) ?? '--'));
ok(fk.bestClean === blk.bestClean, 'forked (inlined) lap === block lap (fork preserves behavior)');

console.log(failed ? `\n❌ ${failed} FAILED` : '\n✅ ALL PASS — composite blocks preserve behavior');
process.exit(failed ? 1 : 0);
