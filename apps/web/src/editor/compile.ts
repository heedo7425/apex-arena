// Convert between React Flow (nodes+edges) and the core Graph, both ways.
import { makeGraph, NT, arePortsCompatible, portType, validateGraph } from '@apex/core'
import type { Graph, GNode, GraphIssue } from '@apex/core'
import { defaultParams, metaOf } from './nodeMeta'

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

export function connectionIssue(nodes:RFNode[], edges:RFEdge[], source:string, sourceHandle:string, target:string, targetHandle:string): string | null {
  if (source === target) return '같은 노드 안에서는 직접 연결할 수 없어요.'
  if (edges.some(e => e.target === target && e.targetHandle === targetHandle)) return '이 입력 포트에는 이미 선이 연결되어 있어요.'
  const from = nodes.find(n => n.id === source), to = nodes.find(n => n.id === target)
  if (!from || !to) return '연결할 노드를 찾지 못했어요.'
  if (!arePortsCompatible(from.data.coreType, sourceHandle, to.data.coreType, targetHandle)) {
    const out = portType(from.data.coreType, sourceHandle, 'out') ?? '?'
    const input = portType(to.data.coreType, targetHandle, 'in') ?? '?'
    return `${metaOf(from.data.coreType).label}의 ${out} 출력은 ${input} 입력에 연결할 수 없어요.`
  }
  const candidate = edges.concat({ id:'candidate', source, sourceHandle, target, targetHandle })
  if (validateGraph(rfToCore(nodes, candidate), NT).some(i => i.code === 'cycle')) return '그래프가 순환하게 되는 연결이에요. 피드백은 Delay 노드를 통해서만 만들 수 있어요.'
  return null
}

export function canConnect(nodes:RFNode[], edges:RFEdge[], source:string, sourceHandle:string, target:string, targetHandle:string): boolean {
  return connectionIssue(nodes, edges, source, sourceHandle, target, targetHandle) === null
}

export function graphIssues(nodes:RFNode[], edges:RFEdge[]): GraphIssue[] {
  return validateGraph(rfToCore(nodes, edges), NT, { requireOutputs:true })
}

export function graphReady(nodes:RFNode[], edges:RFEdge[]): boolean {
  return graphIssues(nodes, edges).length === 0
}
