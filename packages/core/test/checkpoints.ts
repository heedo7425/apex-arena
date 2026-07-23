// Physics v2 Phase 2 item 3: ordered checkpoint lap validation (v2). v1 lap timing unchanged.
import { DT, buildWorld } from '../src/index.ts';
import { makeSim, tick, advanceCheckpoint, SECTOR_FRACS } from '../src/sim/runner.ts';
import { PURSUIT } from '../src/graph/presets.ts';

let failed = 0;
function ok(cond: boolean, msg: string) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; }

// ---- pure ordered-checkpoint crossing ----
{ let cp = 0, prev = 0;
  for (let p = 0; p <= 1.00001; p += 0.01) { cp = advanceCheckpoint(prev, p, cp); prev = p; }
  ok(cp === SECTOR_FRACS.length, 'a smooth full lap crosses every ordered checkpoint'); }
{ // index-wrap shortcut: jump across the track skipping interior checkpoints
  let cp = 0;
  cp = advanceCheckpoint(0.20, 0.85, cp);  // only the first checkpoint (0.25) counts on a single forward step
  cp = advanceCheckpoint(0.85, 0.98, cp);  // 0.5 / 0.75 already behind -> cannot be counted
  ok(cp < SECTOR_FRACS.length, 'an index-wrap shortcut fails to register all checkpoints'); }
{ // out-of-order / backward motion never advances the next checkpoint
  ok(advanceCheckpoint(0.6, 0.3, 1) === 1, 'backward progress does not advance the checkpoint'); }

// ---- a real v2 lap passes every checkpoint before the finish line ----
{ const s = makeSim(buildWorld({ physicsVersion:2 }), PURSUIT, 1);
  let maxCp = 0;
  for (let i = 0; i < Math.round(70/DT); i++) { tick(s); maxCp = Math.max(maxCp, s.cpNext); if (s.laps.length) break; }
  ok(maxCp === SECTOR_FRACS.length, 'a real v2 lap passes all ordered checkpoints before finishing');
  ok(s.laps.length === 1, 'the v2 lap still registers at the finish line'); }

console.log(failed === 0 ? '\nALL PASS - physics v2 Phase 2 checkpoint lap validation verified' : `\n${failed} FAILED`);
if (failed) process.exit(1);
