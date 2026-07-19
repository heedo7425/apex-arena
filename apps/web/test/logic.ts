import { buildWorld, runFor, FTG } from '@apex/core'
import { rfToCore, coreToRF } from '../src/editor/compile.ts'
import { LEVELS } from '../src/campaign/levels.ts'
let fail=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++}
const world=buildWorld()
const rf=coreToRF(FTG); const g2=rfToCore(rf.nodes,rf.edges)
const a=runFor(world,FTG,1,40), b=runFor(world,g2,1,40)
console.log('FTG orig bestClean',a.bestClean?.toFixed(2),'| roundtrip',b.bestClean?.toFixed(2))
ok(rf.nodes.length===Object.keys(FTG.nodes).length,'coreToRF node count matches')
ok(b.bestClean!==null && Math.abs((a.bestClean||0)-(b.bestClean||0))<0.01,'compile roundtrip drives identically')
for(const l of LEVELS){ const r=runFor(world,l.starter,1,40)
  console.log(`  ${l.id} ${l.title.padEnd(18)} laps=${r.laps.length} clean=${r.laps.filter(x=>!x.dirty).length} best=${r.bestClean?.toFixed(1)??'--'} nan=${r.nan}`)
  ok(!r.nan, `${l.id} starter runs (no NaN)`) }
console.log(fail?`\n❌ ${fail} FAILED`:'\n✅ ALL PASS — compile + level starters valid')
process.exit(fail?1:0)
