import { buildWorld, runFor, FTG, makeGraph } from '@apex/core'
// inline copies of compile logic (same as src/editor/compile.ts) to validate the approach in node
function coreToRF(g){ const nodes=g.order.map(id=>({id,data:{coreType:g.nodes[id].type,params:{...(g.nodes[id].params||{})}}}))
  const edges=[]; for(const id of g.order){const n=g.nodes[id]; if(!n.in)continue; for(const port in n.in){const r=n.in[port]; if(r&&r[0]==='n')edges.push({source:r[1],sourceHandle:r[2],target:id,targetHandle:port})}}
  return {nodes,edges} }
function rfToCore(nodes,edges){ const cn={}; for(const n of nodes)cn[n.id]={type:n.data.coreType,params:{...n.data.params},in:{}}
  for(const e of edges){if(cn[e.target])cn[e.target].in[e.targetHandle]=['n',e.source,e.sourceHandle]}
  return makeGraph(cn) }
const world=buildWorld()
const rf=coreToRF(FTG); const g2=rfToCore(rf.nodes,rf.edges)
const a=runFor(world,FTG,1,40), b=runFor(world,g2,1,40)
console.log('nodes',rf.nodes.length,'edges',rf.edges.length)
console.log('FTG orig bestClean',a.bestClean?.toFixed(2),'| roundtrip',b.bestClean?.toFixed(2))
const okCount = rf.nodes.length===Object.keys(FTG.nodes).length
const okDrive = b.bestClean!==null && Math.abs((a.bestClean||0)-(b.bestClean||0))<0.01
console.log(okCount?'PASS node count':'FAIL node count')
console.log(okDrive?'PASS roundtrip drives identically':'FAIL roundtrip')
process.exit(okCount&&okDrive?0:1)
