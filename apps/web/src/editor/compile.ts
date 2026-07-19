// Convert between React Flow (nodes+edges) and the core Graph, both ways.
import { makeGraph } from '@apex/core'
import type { Graph, GNode } from '@apex/core'
import { defaultParams, ins } from './nodeMeta'

export type RFNode = { id:string; type:'apex'; position:{x:number;y:number}; data:{ coreType:string; params:Record<string,number> } }
export type RFEdge = { id:string; source:string; sourceHandle:string; target:string; targetHandle:string }

// RF graph -> runnable core Graph
export function rfToCore(nodes:RFNode[], edges:RFEdge[]): Graph {
  const cn:Record<string,GNode> = {}
  for(const n of nodes) cn[n.id] = { type:n.data.coreType, params:{...n.data.params}, pos:[n.position.x,n.position.y], in:{} }
  for(const e of edges){ if(cn[e.target]) cn[e.target].in![e.targetHandle] = ['n', e.source, e.sourceHandle] }
  return makeGraph(cn)
}

// core Graph -> RF (for loading presets/levels); auto-layout by topological depth
export function coreToRF(g:Graph): { nodes:RFNode[]; edges:RFEdge[] } {
  const depth:Record<string,number> = {}
  const dof = (id:string):number => {
    if(depth[id]!==undefined) return depth[id]
    depth[id]=0
    const n=g.nodes[id]; let d=0
    if(n.in) for(const p in n.in){ const r=n.in[p]; if(r&&r[0]==='n') d=Math.max(d, dof(r[1] as string)+1) }
    return depth[id]=d
  }
  g.order.forEach(dof)
  const perCol:Record<number,number> = {}
  const nodes:RFNode[] = g.order.map(id=>{
    const n=g.nodes[id], d=depth[id]; const row=(perCol[d]=(perCol[d]??0)+1)-1
    const pos = n.pos ? {x:n.pos[0],y:n.pos[1]} : {x:d*210, y:row*96}
    return { id, type:'apex', position:pos, data:{ coreType:n.type, params:{...defaultParams(n.type), ...(n.params as any||{})} } }
  })
  const edges:RFEdge[] = []
  for(const id of g.order){ const n=g.nodes[id]; if(!n.in) continue
    for(const port in n.in){ const r=n.in[port]; if(r&&r[0]==='n') edges.push({id:`${r[1]}.${r[2]}->${id}.${port}`, source:r[1] as string, sourceHandle:r[2] as string, target:id, targetHandle:port}) } }
  return { nodes, edges }
}

let uid = 1
export function newNode(coreType:string, x:number, y:number): RFNode {
  return { id:`${coreType.replace(/\W/g,'')}_${uid++}`, type:'apex', position:{x,y}, data:{ coreType, params:defaultParams(coreType) } }
}
// is the graph "complete enough" to run? (has both sinks wired)
export function graphReady(nodes:RFNode[], edges:RFEdge[]): boolean {
  const hasSink=(t:string)=> nodes.some(n=>n.data.coreType===t && edges.some(e=>e.target===n.id))
  return hasSink('sink.steer') && hasSink('sink.throttle')
}
