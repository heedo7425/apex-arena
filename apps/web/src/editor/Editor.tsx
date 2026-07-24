import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, addEdge,
  useNodesState, useEdgesState, useReactFlow, type Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GraphNode } from './GraphNode'
import { VisualizePanel } from './VisualizePanel'
import { connectionIssue, graphIssues, newNode, rfToCore, coreToRF, type RFNode, type RFEdge } from './compile'
import { defaultParams, metaOf, colorOf, ins, outs, PALETTE_CATS, HIGHER_ORDER, defaultLambda, lambdaPalette } from './nodeMeta'
import { useBlockLibrary, useLive, usePending, useVisualization } from '../store'
import { NT, inlineComposite, encapsulate, portType, makeGraph, type Graph } from '@apex/core'

const nodeTypes = { apex: GraphNode }

type OpenNode = { id:string; type:string; label:string; sub:Graph; params:Record<string,any> }
type InnerLevel = { id:string; type:string; label:string; sub:Graph }
function InnerView({ node, onClose, onFork, onSave }: { node:OpenNode; onClose:()=>void; onFork:()=>void; onSave:()=>void }) {
  const rootLive=useLive(s=>s.vals?.[node.id])
  const [trail,setTrail]=useState<InnerLevel[]>([{id:node.id,type:node.type,label:node.label,sub:node.sub}])
  const [inspect,setInspect]=useState<{id:string;type:string}|null>(null)
  useEffect(()=>{setTrail([{id:node.id,type:node.type,label:node.label,sub:node.sub}]);setInspect(null)},[node])
  const current=trail[trail.length-1]
  let currentLive=rootLive
  for(let i=1;i<trail.length;i++)currentLive=currentLive?.__inner?.[trail[i].id]
  const innerVals=currentLive?.__inner
  const g=React.useMemo(()=>coreToRF(current.sub),[current.sub])
  const styledEdges=React.useMemo(()=>g.edges.map(edge=>({...edge,
    className:'inner-edge', zIndex:3, style:{stroke:'#52677c',strokeWidth:2.6},
  })),[g.edges])
  const [innerNodes,setInnerNodes,onInnerNodesChange]=useNodesState(g.nodes as any)
  const [innerEdges,setInnerEdges]=useEdgesState(styledEdges as any)
  useEffect(()=>{
    setInnerNodes(g.nodes as any)
    setInnerEdges(styledEdges as any)
  },[g,styledEdges,setInnerNodes,setInnerEdges])
  const enter=(id:string,type:string,params:Record<string,any>)=>{
    const sub=(NT[type]?.sub??params?.sub) as Graph|undefined
    if(!sub)return
    setTrail(t=>[...t,{id,type,label:type==='blk.user'?(params.label||'▣ 내 블록'):metaOf(type).label,sub}]);setInspect(null)
  }
  const displayNodes=(innerNodes as RFNode[]).map(n=>({...n,data:{...n.data,label:n.data.coreType==='cparam'?`parameter · ${n.data.params.param}`:n.data.label,liveOverride:innerVals?(innerVals[n.id]??null):null,onOpen:enter,onInspect:(id:string,type:string)=>setInspect({id,type})}}))
  const inspectType=inspect?.type, inspectLive=inspect?innerVals?.[inspect.id]:null
  return (
    <div className="inner-view">
      <div className="inner-bar">
        <button className="iv-close" onClick={onClose}>← 그래프로</button>
        <nav className="iv-crumbs" aria-label="블록 내부 경로">
          {trail.map((p,i)=><button key={`${p.id}-${i}`} className={i===trail.length-1?'on':''} onClick={()=>{setTrail(t=>t.slice(0,i+1));setInspect(null)}}>{p.label}</button>)}
        </nav>
        <span className="iv-title"><em>원본 블록 내부 · 배선 미리보기</em></span>
        {node.type==='blk.user'&&<button className="iv-save" onClick={onSave}>보관함에 저장</button>}
        <button className="iv-fork" onClick={onFork} title="원본을 보호하면서 내부 파트를 편집 가능한 그래프로 펼치기">편집하기 · 펼치기 ⤢</button>
      </div>
      <div className="iv-fork-note">연결선은 실제 내부 배선입니다 · 수정하려면 편집 모드로 펼치세요 · {node.sub.order.filter(id=>node.sub.nodes[id].type!=='cin').length}개 파트</div>
      <div className="inner-flow">
        <ReactFlowProvider>
          <ReactFlow nodes={displayNodes as any} edges={innerEdges as any} nodeTypes={nodeTypes}
            onNodesChange={onInnerNodesChange} fitView minZoom={0.4} maxZoom={2}
            nodesDraggable={false} nodesConnectable={false}
            defaultEdgeOptions={{zIndex:3,style:{stroke:'#52677c',strokeWidth:2.6}}}
            elementsSelectable proOptions={{ hideAttribution:true }}
            onNodeMouseEnter={(_,n:any)=>setInspect({id:n.id,type:n.data.coreType})}
            onNodeClick={(_,n:any)=>setInspect({id:n.id,type:n.data.coreType})}
            onNodeDoubleClick={(_,n:any)=>enter(n.id,n.data.coreType,n.data.params)}>
            <Background color="#314052" gap={24} size={1} />
          </ReactFlow>
        </ReactFlowProvider>
        <button className="iv-edit-banner" onClick={onFork}>
          <span>배선을 직접 바꾸고 싶나요?</span>
          <b>편집 가능한 그래프로 펼치기 →</b>
        </button>
        {inspectType&&<aside className="iv-inspector" style={{['--tip' as any]:colorOf(inspectType)}}>
          <div className="nt-cap">{metaOf(inspectType).cat} · INTERNAL PART</div>
          <div className="nt-title">{metaOf(inspectType).label}</div>
          <p>{metaOf(inspectType).desc||'설명 준비 중.'}</p>
          {metaOf(inspectType).real&&<div className="nt-real">REAL WORLD · {metaOf(inspectType).real}</div>}
          {inspectLive&&<div className="iv-live"><small>LIVE SIGNAL</small>
            {Object.entries(inspectLive).filter(([k])=>k!=='__inner').map(([k,v])=><span key={k}><b>{k}</b>{typeof v==='number'?v.toFixed(3):Array.isArray(v)?`[${v.length}]`:typeof v==='object'?'{…}':String(v)}</span>)}
          </div>}
        </aside>}
      </div>
    </div>
  )
}

// Editable inner editor for a higher-order node's lambda (arg → ▹ λ 반환).
function LambdaEditor({ node, onApply, onClose }:{ node:{id:string;type:string;lambda:Graph}; onApply:(g:Graph)=>void; onClose:()=>void }) {
  const OUT='__lout'
  const seed=React.useMemo(()=>{
    const rf=coreToRF(node.lambda)
    const maxX=Math.max(120,...rf.nodes.map(n=>n.position.x))
    const outNode:any={ id:OUT, type:'apex', position:{x:maxX+240,y:60}, data:{ coreType:'lambda.out', params:{} } }
    const edges:any[]=[...rf.edges]
    if(node.lambda.outNode) edges.push({ id:`${node.lambda.outNode}.${node.lambda.outPort}->${OUT}.v`, source:node.lambda.outNode, sourceHandle:node.lambda.outPort!, target:OUT, targetHandle:'v' })
    return { nodes:[...rf.nodes,outNode], edges }
  },[node])
  const [nodes,setNodes,onNodesChange]=useNodesState([] as any)
  const [edges,setEdges,onEdgesChange]=useEdgesState([] as any)
  const [err,setErr]=useState<string|null>(null)
  const latest=useRef<{nodes:any[];edges:any[]}>({nodes:[],edges:[]}); latest.current={nodes:nodes as any,edges:edges as any}
  const pending=useRef<{node:string;handle:string;kind:'source'|'target'}|null>(null)
  const onParam=(id:string,key:string,val:number)=>setNodes((nds:any)=>nds.map((n:any)=>n.id===id?{...n,data:{...n.data,params:{...n.data.params,[key]:val}}}:n))
  const onPort=(nd:string,handle:string,kind:'source'|'target')=>{
    const p=pending.current
    if(p&&p.kind!==kind&&p.node!==nd){
      const src=kind==='source'?{node:nd,handle}:{node:p.node,handle:p.handle}
      const tgt=kind==='target'?{node:nd,handle}:{node:p.node,handle:p.handle}
      const issue=connectionIssue(latest.current.nodes as any,latest.current.edges as any,src.node,src.handle,tgt.node,tgt.handle)
      if(issue){setErr(issue);pending.current=null;usePending.getState().setSel(null);return}
      setEdges((eds:any)=>addEdge({id:`${src.node}.${src.handle}->${tgt.node}.${tgt.handle}`,source:src.node,sourceHandle:src.handle,target:tgt.node,targetHandle:tgt.handle},eds))
      setErr(null);pending.current=null;usePending.getState().setSel(null)
    } else { pending.current={node:nd,handle,kind};usePending.getState().setSel(`${nd}|${handle}|${kind}`) }
  }
  const withCb=(ns:any[])=>ns.map(n=>({...n,data:{...n.data,onParam,onPort}}))
  React.useEffect(()=>{ setNodes(withCb(seed.nodes) as any); setEdges(seed.edges as any); setErr(null) },[seed])
  const addPart=(type:string)=>{ const i=(nodes as any).length; const nn=newNode(type,60+(i%3)*180,60+Math.floor(i/3)*120); setNodes((nds:any)=>nds.concat({...nn,data:{coreType:type,params:defaultParams(type),onParam,onPort}})) }
  const onConnect=(c:any)=>{ if(!c.source||!c.sourceHandle||!c.target||!c.targetHandle)return; const issue=connectionIssue(latest.current.nodes as any,latest.current.edges as any,c.source,c.sourceHandle,c.target,c.targetHandle); if(issue){setErr(issue);return} setEdges((eds:any)=>addEdge({...c,id:`${c.source}.${c.sourceHandle}->${c.target}.${c.targetHandle}`},eds));setErr(null) }
  const apply=()=>{
    const core=rfToCore(latest.current.nodes as any,latest.current.edges as any)
    const outId=Object.keys(core.nodes).find(id=>core.nodes[id].type==='lambda.out')
    const ref=outId?core.nodes[outId].in?.v:undefined
    if(!ref||ref[0]!=='n'){ setErr('▹ λ 반환에 결과 신호를 연결하세요.'); return }
    const inner:any={...core.nodes}; delete inner[outId!]
    onApply(makeGraph(inner, ref[1] as string, ref[2] as string)); onClose()
  }
  return (
    <div className="inner-view">
      <div className="inner-bar">
        <button className="iv-close" onClick={onClose}>← 취소</button>
        <span className="iv-title">{metaOf(node.type).label} · 람다 편집 <em>arg → ▹ λ 반환</em></span>
        <button className="iv-fork" onClick={apply}>적용 · 저장</button>
      </div>
      <div className="iv-fork-note">{err?<span style={{color:'var(--bad)'}}>{err}</span>:'왼쪽 파트를 캔버스에 추가하고 arg 원소를 계산해 ▹ λ 반환에 연결하세요 · 포트 클릭 또는 드래그로 연결'}</div>
      <div className="lambda-body">
        <div className="lambda-palette">
          {lambdaPalette(node.type).map(t=><button key={t} className="pal-chip" style={{['--part' as any]:colorOf(t)}} onClick={()=>addPart(t)}><i>+</i><span>{metaOf(t).label}</span></button>)}
        </div>
        <div className="inner-flow">
          <ReactFlowProvider>
            <ReactFlow nodes={nodes as any} edges={edges as any} nodeTypes={nodeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
              deleteKeyCode={["Backspace","Delete"]} fitView minZoom={0.4} maxZoom={2}
              onPaneClick={()=>{pending.current=null;usePending.getState().setSel(null)}}
              proOptions={{hideAttribution:true}}>
              <Background color="#314052" gap={24} size={1}/>
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  )
}

type Decorate = Record<string, { label?: string; highlight?: boolean; tag?: string }>
type HoverInfo = { type:string; x:number; y:number }
function signalUnit(type:string,port:string){
  if(type==='src.speed')return 'm/s'
  if(port==='yaw'||port==='psi')return 'rad'
  if(port==='k'||port==='kappa')return '1/m'
  if(port==='x'||port==='y'||port==='s'||port==='d'||port==='width')return 'm'
  return ''
}
function EditorInner({ initial, palette, onGraph, decorate, highlightPalette, nodeDefaults, requiredOutputs, onSkill }:
  { initial:{nodes:RFNode[];edges:RFEdge[]}; palette:string[]; onGraph:(g:Graph)=>void; decorate?:Decorate; highlightPalette?:string; nodeDefaults?:Record<string,Record<string,number>>; requiredOutputs?:string[]; onSkill?:(skill:string)=>void }) {

  const { fitView } = useReactFlow()
  const frameBuild = () => requestAnimationFrame(() => fitView({ padding:0.2, duration:250 }))
  const compact = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  const arranged = compact ? initial.nodes.map((n,i)=>({...n,position:{x:10+(i%2)*225,y:70+Math.floor(i/2)*138}})) : initial.nodes
  const {blocks,saveBlock,removeBlock}=useBlockLibrary()
  const liveVals=useLive(s=>s.vals)
  const vizSignals=useVisualization(s=>s.signals)
  const addVisual=useVisualization(s=>s.addSignal)
  const latest = useRef<{nodes:RFNode[];edges:RFEdge[]}>({nodes:arranged,edges:initial.edges})
  const [notice,setNotice] = useState<string|null>(null)
  const [bayOpen,setBayOpen] = useState(true)
  const [paletteQuery,setPaletteQuery] = useState('')
  const [recentParts,setRecentParts] = useState<string[]>([])
  const [zoom,setZoom] = useState(1)
  const [info,setInfo]=useState<string|null>(null)
  const [openNode,setOpenNode]=useState<OpenNode|null>(null)
  const [openLambda,setOpenLambda]=useState<{id:string;type:string;lambda:Graph}|null>(null)
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const blockUid=useRef(1)
  const [hover,setHover]=useState<HoverInfo|null>(null)
  const hoverTimer=useRef<number|null>(null)
  const [selectedEdgeId,setSelectedEdgeId]=useState<string|null>(null)
  const trashRef = useRef<HTMLDivElement>(null)
  const [draggingNode,setDraggingNode] = useState(false)
  const [trashHot,setTrashHot] = useState(false)
  const history = useRef<{nodes:RFNode[];edges:RFEdge[]}[]>([])
  const [undoCount,setUndoCount] = useState(0)
  const remember = () => {
    const snap = latest.current
    history.current.push({
      nodes:snap.nodes.map(n => ({...n,position:{...n.position},data:{...n.data,params:{...n.data.params}}})),
      edges:snap.edges.map(e => ({...e})),
    })
    if (history.current.length > 30) history.current.shift()
    setUndoCount(history.current.length)
  }
  const onParam = useCallback((id:string,key:string,val:number)=>{
    onSkill?.('param');remember()
    setNodes((nds:any)=>nds.map((n:any)=>n.id===id?{...n,data:{...n.data,params:{...n.data.params,[key]:val}}}:n))
    // eslint-disable-next-line
  },[])
  const pending = useRef<{node:string;handle:string;kind:'source'|'target'}|null>(null)
  const deleteNode = useCallback((id:string, save=true)=>{
    onSkill?.('delete');if(save)remember()
    setNodes((nds:any)=>nds.filter((n:any)=>n.id!==id))
    setEdges((eds:any)=>eds.filter((e:any)=>e.source!==id&&e.target!==id))
    if(pending.current?.node===id){pending.current=null;usePending.getState().setSel(null)}
    setInfo(null);setHover(null);setNotice("블록과 연결선을 제거했습니다. UNDO로 되돌릴 수 있어요.")
    // eslint-disable-next-line
  },[])
  const isOverTrash = (event:any) => {
    const point = event.changedTouches?.[0] ?? event.touches?.[0] ?? event
    const box = trashRef.current?.getBoundingClientRect()
    return !!box && point.clientX >= box.left && point.clientX <= box.right && point.clientY >= box.top && point.clientY <= box.bottom
  }
  const onPort = useCallback((node:string,handle:string,kind:'source'|'target')=>{
    const p=pending.current
    if(p&&p.kind!==kind&&p.node!==node){
      const src=kind==='source'?{node,handle}:{node:p.node,handle:p.handle}
      const tgt=kind==='target'?{node,handle}:{node:p.node,handle:p.handle}
      const issue=connectionIssue(latest.current.nodes,latest.current.edges,src.node,src.handle,tgt.node,tgt.handle)
      if(issue){setNotice(issue);pending.current=null;usePending.getState().setSel(null);return}
      remember()
      setEdges((eds:any)=>addEdge({id:`${src.node}.${src.handle}->${tgt.node}.${tgt.handle}`,source:src.node,sourceHandle:src.handle,target:tgt.node,targetHandle:tgt.handle},eds))
      setNotice('링크 체결 완료 · 데이터 신호가 흐릅니다.');onSkill?.('connect')
      pending.current=null;usePending.getState().setSel(null)
    }else{
      pending.current={node,handle,kind};usePending.getState().setSel(`${node}|${handle}|${kind}`)
      setNotice(kind==='source'?'신호를 받을 입력 포트를 선택하세요.':'신호를 보낼 출력 포트를 선택하세요.')
    }
    // eslint-disable-next-line
  },[])
  const clearPending=()=>{pending.current=null;usePending.getState().setSel(null);setNotice(null)}
  const showHover=(type:string, el:HTMLElement)=>{
    if(hoverTimer.current!=null)window.clearTimeout(hoverTimer.current)
    const box=el.getBoundingClientRect(), width=286, height=190, gap=12
    const right=box.right+gap, left=box.left-width-gap
    hoverTimer.current=window.setTimeout(()=>{setHover({type,x:right+width<window.innerWidth?right:Math.max(8,left),y:Math.max(8,Math.min(box.top,window.innerHeight-height-8))});hoverTimer.current=null},700)
  }
  const hideHover=()=>{if(hoverTimer.current!=null)window.clearTimeout(hoverTimer.current);hoverTimer.current=null;setHover(null)}
  useEffect(()=>()=>{if(hoverTimer.current!=null)window.clearTimeout(hoverTimer.current)},[])
  const withCb=(ns:RFNode[])=>ns.map(n=>({...n,data:{...n.data,onParam,onPort,onHover:showHover,onHoverEnd:hideHover,...(decorate?.[n.id]||{})}}))
  const visualizeSignal=useCallback((nodeId:string,port:string)=>{
    const node=latest.current.nodes.find(n=>n.id===nodeId)
    if(!node)return
    const valueType=portType(node.data.coreType,port,'out')||'unknown'
    if(!['num','objects','trajectory','trajectories','prediction','predictions','space','breakdown','breakdowns','violations','violationSets'].includes(valueType)){
      setNotice(`${valueType} 신호는 아직 VISUALIZE 표시를 지원하지 않습니다.`)
      return
    }
    addVisual({nodeId,port,valueType,label:`${metaOf(node.data.coreType).label} · ${port}`,unit:signalUnit(node.data.coreType,port)})
    setNotice(`${metaOf(node.data.coreType).label}의 ${port} 신호를 VISUALIZE에 추가했습니다.`)
  },[addVisual])

  const [nodes,setNodes,onNodesChange]=useNodesState(withCb(arranged) as any)
  const [edges,setEdges,onEdgesChange]=useEdgesState(initial.edges as any)
  const handleNodesChange = (changes:any[]) => {
    if (changes.some(c => c.type === 'remove')) remember()
    onNodesChange(changes)
  }
  const handleEdgesChange = (changes:any[]) => {
    if (changes.some(c => c.type === 'remove')) {remember();setSelectedEdgeId(null)}
    onEdgesChange(changes)
  }
  const deleteSelectedEdge=()=>{
    if(!selectedEdgeId)return
    remember();onSkill?.('delete');setEdges((items:any)=>items.filter((edge:any)=>edge.id!==selectedEdgeId));setSelectedEdgeId(null);setNotice('연결선만 제거했습니다. 블록은 그대로 유지됩니다.')
  }
  const undo = () => {
    const prev = history.current.pop()
    if (!prev) return
    pending.current=null; usePending.getState().setSel(null)
    setNodes(withCb(prev.nodes) as any); setEdges(prev.edges as any)
    setUndoCount(history.current.length); setNotice('이전 빌드 상태로 되돌렸습니다.'); frameBuild()
  }
  const resetBuild = () => {
    remember(); pending.current=null; usePending.getState().setSel(null)
    setNodes(withCb(arranged) as any); setEdges(initial.edges as any)
    setNotice('미션 시작 상태로 초기화했습니다.'); frameBuild()
  }
  latest.current={nodes:nodes as any,edges:edges as any}

  const onConnect=useCallback((c:Connection)=>{
    if(!c.source||!c.sourceHandle||!c.target||!c.targetHandle)return
    const issue=connectionIssue(latest.current.nodes,latest.current.edges,c.source,c.sourceHandle,c.target,c.targetHandle)
    if(issue){setNotice(issue);return}
    remember()
    setEdges((eds:any)=>addEdge({...c,id:`${c.source}.${c.sourceHandle}->${c.target}.${c.targetHandle}`},eds))
    setNotice('링크 체결 완료 · 데이터 신호가 흐릅니다.');onSkill?.('connect')
  },[setEdges,onSkill])

  const sigRef=useRef('')
  useEffect(()=>{
    const sig=JSON.stringify([nodes.map((n:any)=>[n.id,n.data.coreType,n.data.params]),edges.map((e:any)=>[e.source,e.sourceHandle,e.target,e.targetHandle])])
    if(sig!==sigRef.current){sigRef.current=sig;onGraph(rfToCore(nodes as any,edges as any))}
  },[nodes,edges,onGraph])

  const forkOpen = () => {
    if(!openNode) return
    onSkill?.('fork')
    const core = rfToCore(latest.current.nodes as any, latest.current.edges as any)
    const inlined = inlineComposite(core, openNode.id, NT)
    const rf = coreToRF(inlined)
    remember(); setNodes(withCb(rf.nodes) as any); setEdges(rf.edges as any)
    setOpenNode(null); setNotice('블록을 펼쳐 내 그래프에 붙였어요.'); frameBuild()
  }
  const openBlock = (id:string, type:string) => {
    const rfNode = latest.current.nodes.find(n=>n.id===id) as any
    const sub = (NT[type]?.sub ?? rfNode?.data?.params?.sub) as Graph | undefined
    if(!sub) return
    const label = rfNode?.data?.label || (type==='blk.user' ? (rfNode?.data?.params?.label || '▣ 내 블록') : metaOf(type).label)
    setOpenNode({ id, type, label, sub, params:{...(rfNode?.data?.params||{})} });onSkill?.('open')
  }
  const onNodeDouble = (id:string, type:string) => {
    if(HIGHER_ORDER.has(type)){
      const rfNode = latest.current.nodes.find(n=>n.id===id) as any
      const lambda = (rfNode?.data?.params?.lambda as Graph) ?? defaultLambda(type)
      setOpenLambda({ id, type, lambda });onSkill?.('open')
    } else openBlock(id, type)
  }
  const applyLambda = (id:string, lambda:Graph) => {
    remember()
    setNodes((nds:any)=>nds.map((n:any)=>n.id===id?{...n,data:{...n.data,params:{...n.data.params,lambda}}}:n))
    setNotice('람다를 저장했습니다.')
  }
  const groupSelected = () => {
    const ids = selectedIds.filter(id => latest.current.nodes.some(n=>n.id===id))
    if(ids.length < 2) return
    const core = rfToCore(latest.current.nodes as any, latest.current.edges as any)
    const seq=blockUid.current++, blockId = `blk_${seq}`
    const grouped = encapsulate(core, ids, blockId, NT, `▣ 내 블록 ${seq}`)

    if(grouped.nodes[blockId] === undefined){ setNotice('이 노드들은 블록으로 묶을 수 없어요.'); return }
    const rf = coreToRF(grouped)
    remember(); setNodes(withCb(rf.nodes) as any); setEdges(rf.edges as any)
    setSelectedIds([]); setNotice(`${ids.length}개 노드를 블록으로 묶었어요. (더블클릭해 열기)`); frameBuild()
  }
  const addNode=(type:string)=>{
    onSkill?.('add');remember();setRecentParts(r=>[type,...r.filter(x=>x!==type)].slice(0,5))
    const index=nodes.length
    const nn=newNode(type,compact?10+(index%2)*225:70+(index%3)*260,compact?70+Math.floor(index/2)*138:70+(Math.floor(index/3)%4)*128)
    setNodes((nds:any)=>nds.concat({...nn,data:{coreType:type,params:{...defaultParams(type),...(HIGHER_ORDER.has(type)?{lambda:defaultLambda(type)}:{}),...(nodeDefaults?.[type]??{})},onParam,onPort,onHover:showHover,onHoverEnd:hideHover}}))
    setNotice(HIGHER_ORDER.has(type)?`${metaOf(type).label} 장착 · 더블클릭해 람다를 편집`:`${metaOf(type).label} 파트를 장착했습니다.`)
    if(compact)setBayOpen(false)
    frameBuild()
  }
  const autoLayout=()=>{
    const core=rfToCore(latest.current.nodes as any,latest.current.edges as any)
    for(const node of Object.values(core.nodes))delete node.pos
    const rf=coreToRF(core)
    remember();setNodes(withCb(rf.nodes) as any);setEdges(rf.edges as any);setNotice('센서에서 출력 방향으로 그래프를 자동 정렬했습니다.');frameBuild()
  }
  const addSavedBlock=(saved:(typeof blocks)[number])=>{
    remember()
    const index=nodes.length, nn=newNode('blk.user',compact?10+(index%2)*225:70+(index%3)*260,compact?70+Math.floor(index/2)*138:70+(Math.floor(index/3)%4)*128)
    const params=JSON.parse(JSON.stringify(saved.params))
    setNodes((nds:any)=>nds.concat({...nn,data:{coreType:'blk.user',params:{...params,label:saved.label},onParam,onPort,onHover:showHover,onHoverEnd:hideHover}}))
    setNotice(`${saved.label} 블록을 보관함에서 장착했습니다.`);if(compact)setBayOpen(false);frameBuild()
  }
  const saveOpen=()=>{
    if(!openNode)return
    const raw=window.prompt('보관함에 표시할 블록 이름',openNode.label.replace(/^▣\s*/,''))
    const name=raw?.trim();if(!name)return
    const label=`▣ ${name}`
    saveBlock(label,{...openNode.params,label})
    setNotice(`${label}을 Parts Bay 보관함에 저장했습니다.`);setOpenNode(null)
  }


  const issues=graphIssues(nodes as any,edges as any,requiredOutputs)
  const issueNodeIds=new Set(issues.map(i=>i.nodeId).filter(Boolean))
  const activePathIds=new Set<string>()
  const visitActive=(id:string)=>{if(activePathIds.has(id))return;activePathIds.add(id);for(const edge of edges as RFEdge[])if(edge.target===id)visitActive(edge.source)}
  for(const node of nodes as RFNode[])if(node.data.coreType.startsWith('sink.'))visitActive(node.id)
  const renderedEdges=(edges as RFEdge[]).map(edge=>({...edge,className:[activePathIds.has(edge.source)&&activePathIds.has(edge.target)?'active-path':'',edge.id===selectedEdgeId?'wire-selected':''].filter(Boolean).join(' ')}))
  const selectedEdge=(edges as RFEdge[]).find(edge=>edge.id===selectedEdgeId)
  const renderedNodes = (nodes as RFNode[]).map(n => {
    const visualized=vizSignals.filter(s=>s.nodeId===n.id).map(s=>s.port)
    const base={...n,data:{...n.data,onVisualize:visualizeSignal,visualized,issue:issueNodeIds.has(n.id),semanticCompact:zoom<0.76,activePath:activePathIds.has(n.id)}}
    if (n.data.coreType !== 'const') return base
    const targets = [...new Set((edges as RFEdge[]).filter(e => e.source === n.id && e.sourceHandle === 'v').map(e => e.targetHandle))]
    const label = targets.length === 1 ? "value → " + targets[0] : "value"
    return {...base,data:{...base.data,outputLabels:{v:label}}}
  })
  const issue=issues[0]
  const issueNode=issue?.nodeId?(nodes as RFNode[]).find(n=>n.id===issue.nodeId):null
  let buildMessage=issue?.message||'출력 링크를 완성하세요.'
  if(issue?.code==='missing-output')buildMessage=issue.message.includes('steer')?'STEER 출력 블록을 장착하세요.':'THROTTLE 출력 블록을 장착하세요.'
  else if(issue?.code==='unwired-output')buildMessage=`${metaOf(issueNode?.data.coreType||'sink.steer').label}의 x 입력이 비어 있어요.`
  else if(issue?.code==='unwired-input')buildMessage=`${metaOf(issueNode?.data.coreType||'const').label}의 ${issue.port} 입력에 신호가 필요해요.`
  else if(issue?.code==='type-mismatch')buildMessage='포트 데이터 타입이 맞지 않아요. 같은 타입끼리 연결하세요.'
  else if(issue?.code==='cycle')buildMessage='Delay 없이 되돌아오는 연결이 있어요. 피드백 고리를 끊으세요.'
  let runtimeMessage:string|null=null
  for(const n of nodes as RFNode[]){
    const e=n.data.coreType==='std.tocar'?liveVals?.[n.id]?.e:null
    if(e?.x<0){runtimeMessage='목표점이 차량 뒤쪽에 있어요. Lookahead 거리와 경로 입력을 확인하세요.';break}
  }
  for(const edge of edges as RFEdge[]){
    const target=(nodes as RFNode[]).find(n=>n.id===edge.target)
    if(!target?.data.coreType.startsWith('sink.'))continue
    const value=liveVals?.[edge.source]?.[edge.sourceHandle]
    if(value!=null&&!Number.isFinite(value))runtimeMessage='출력 경로에 계산할 수 없는 값이 있어요. 나눗셈 입력을 확인하세요.'
    if(target.data.coreType==='sink.steer'&&Number.isFinite(value)&&Math.abs(value)>1)runtimeMessage='STEER 범위를 넘었어요. 출력 전에 clamp로 −1~1을 제한하세요.'
  }
  const ready=issues.length===0
  const feedback=notice||(ready?(runtimeMessage||'CONTROL ONLINE · 출전 준비 완료'):`CONTROL OFFLINE · ${buildMessage}`)

  return (
    <div className="editor">
      {palette.length>0&&bayOpen&&<div className="palette parts-bay">
        <div className="parts-head">
          <div><span>GARAGE LOADOUT</span><b>제어 파트 장착</b></div>
          <button aria-label="파트 베이 닫기" onClick={()=>setBayOpen(false)}>×</button>
        </div>
        <div className="parts-search"><input value={paletteQuery} onChange={e=>setPaletteQuery(e.target.value)} placeholder="파트 이름·역할 검색" aria-label="Parts Bay 검색"/>{paletteQuery&&<button onClick={()=>setPaletteQuery('')}>×</button>}</div>
        <div className="parts-grid">
          {!paletteQuery&&recentParts.length>0&&<div className="pal-cat recent-parts"><div className="pal-cat-h">RECENT</div><div className="pal-chips">{recentParts.map(t=><button key={t} className="pal-chip" onClick={()=>addNode(t)} style={{['--part' as any]:colorOf(t)}}><i>+</i><span>{metaOf(t).label}</span></button>)}</div></div>}
          {PALETTE_CATS.map(g=>{
            const q=paletteQuery.trim().toLowerCase()
            const types=g.types.filter(t=>palette.includes(t)&&(!q||`${t} ${metaOf(t).label} ${metaOf(t).desc||''}`.toLowerCase().includes(q)))
            if(!types.length)return null
            return <div className="pal-cat" key={g.cat}>
              <div className="pal-cat-h" style={{color:colorOf(types[0])}}>{g.cat}</div>
              <div className="pal-chips">{types.map(t=>
                <button key={t} className={'pal-chip'+(t===highlightPalette?' hl':'')} onClick={()=>addNode(t)} onMouseEnter={e=>showHover(t,e.currentTarget)} onMouseLeave={hideHover} onFocus={e=>showHover(t,e.currentTarget)} onBlur={hideHover}
                  style={{['--part' as any]:colorOf(t)}}>
                  <i>+</i><span>{metaOf(t).label}</span>
                </button>)}</div>
            </div>
          })}
          {blocks.length>0&&<div className="pal-cat saved-blocks">
            <div className="pal-cat-h" style={{color:'#8C7CF0'}}>MY BLOCKS · 모든 미션에서 사용</div>
            <div className="pal-chips">{blocks.map(saved=><div className="saved-row" key={saved.id}>
              <button className="pal-chip" style={{['--part' as any]:'#8C7CF0'}} onClick={()=>addSavedBlock(saved)}>
                <i>+</i><span>{saved.label}</span>
              </button>
              <button className="saved-remove" aria-label={`${saved.label} 보관함에서 삭제`} onClick={()=>removeBlock(saved.id)}>×</button>
            </div>)}</div>
          </div>}

        </div>
        <div className="pal-note">파트 선택 → 캔버스 장착 → 신호 포트 체결 · 빈 곳 드래그로 여러 노드 선택 → <b>블록으로 묶기</b> · 블록을 휴지통에 드롭</div>
      </div>}
      <div className="rf-wrap">
        <div className="editor-actions">
          {selectedIds.length>=2 && <button className="group-btn" onClick={groupSelected} aria-label="선택한 노드를 블록으로 묶기">▣ 블록으로 묶기 ({selectedIds.length})</button>}
          <button onClick={undo} disabled={undoCount === 0} aria-label="마지막 변경 되돌리기">↶ UNDO</button>
          <button onClick={autoLayout} aria-label="그래프 자동 정렬">⇥ 정렬</button>
          <button onClick={resetBuild} aria-label="미션 그래프 초기화">↻ RESET</button>
        </div>
        <div className="editor-topbar">
          {palette.length>0&&!bayOpen&&<button className={'parts-toggle'+(highlightPalette?' hl':'')} onClick={()=>setBayOpen(true)} aria-expanded={bayOpen}>
            <span className="parts-icon">＋</span><span><small>LOADOUT</small><b>PARTS BAY</b></span><em>{palette.length+blocks.length}</em>
          </button>}
          <div className="gf-slot">
            <div className={'graph-feedback '+(notice?'active':ready?'ready':'waiting')} role="status" aria-live="polite">
              <span className="gf-dot"/>{feedback}
            </div>
          </div>
          <button className={'visualize-toggle'+(vizSignals.length?' active':'')} onClick={()=>useVisualization.getState().toggle()}>
            <span>∿</span> VISUALIZE <em>{vizSignals.length}</em>
          </button>
          <div className="editor-mode"><span>BUILD MODE</span><b>CONTROL GRAPH</b></div>
        </div>
        <div ref={trashRef} className={`trash-drop${draggingNode?" dragging":""}${trashHot?" hot":""}`} aria-label="블록 삭제 영역">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg><span>{trashHot?"놓아서 삭제":"여기로 끌어 삭제"}</span>
        </div>
        {selectedEdge&&<div className="wire-toolbar" role="dialog" aria-label="선택한 연결선"><span><small>SELECTED WIRE</small><b>{metaOf((nodes as RFNode[]).find(n=>n.id===selectedEdge.source)?.data.coreType??'').label}.{selectedEdge.sourceHandle} → {metaOf((nodes as RFNode[]).find(n=>n.id===selectedEdge.target)?.data.coreType??'').label}.{selectedEdge.targetHandle}</b></span><button onClick={()=>visualizeSignal(selectedEdge.source,selectedEdge.sourceHandle!)}>∿ Visualize</button><button className="danger" onClick={deleteSelectedEdge}>연결만 삭제</button><button className="close" aria-label="연결선 선택 해제" onClick={()=>setSelectedEdgeId(null)}>×</button></div>}
        <ReactFlow nodes={renderedNodes} edges={renderedEdges} nodeTypes={nodeTypes} deleteKeyCode={["Backspace","Delete"]}
          onNodeDragStart={()=>{remember();setDraggingNode(true)}} onNodeDrag={e=>setTrashHot(isOverTrash(e))}
          onNodeDragStop={(e,node)=>{const remove=isOverTrash(e);setDraggingNode(false);setTrashHot(false);if(remove)deleteNode(node.id,false)}}
          onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange} onConnect={onConnect}
          onSelectionChange={({nodes:sel}:any)=>setSelectedIds(sel.map((n:any)=>n.id))}
          selectionOnDrag panOnDrag={[1,2]} selectionKeyCode={null} multiSelectionKeyCode={["Shift","Meta"]}
          onEdgeClick={(event,edge:any)=>{event.stopPropagation();hideHover();setInfo(null);setSelectedEdgeId(edge.id)}}
          onEdgeDoubleClick={(_,edge:any)=>visualizeSignal(edge.source,edge.sourceHandle)}
          isValidConnection={c=>!!c.source&&!!c.sourceHandle&&!!c.target&&!!c.targetHandle&&!connectionIssue(latest.current.nodes,latest.current.edges,c.source,c.sourceHandle,c.target,c.targetHandle)}
          onNodeClick={(_,node:any)=>{hideHover();setSelectedEdgeId(null);setInfo(node.data.coreType)}} onPaneClick={()=>{clearPending();setSelectedEdgeId(null);hideHover()}}
          onNodeDoubleClick={(_,node:any)=>onNodeDouble(node.id,node.data.coreType)}
          onMove={(_,viewport)=>setZoom(viewport.zoom)}
          fitView minZoom={0.58} maxZoom={2} proOptions={{hideAttribution:true}}>
          <Background color="#314052" gap={24} size={1}/>
          <Controls showInteractive={false}/>
        </ReactFlow>
        <VisualizePanel/>
        {info&&<div className="node-info">
          <button className="ni-close" aria-label="파트 정보 닫기" onClick={()=>setInfo(null)}>×</button>
          <div className="ni-cap">PART INSPECT</div>
          <div className="ni-h" style={{color:colorOf(info)}}>{metaOf(info).label}<span className="ni-cat">{metaOf(info).cat}</span></div>
          <p>{metaOf(info).desc||'설명 준비 중.'}</p>
          {metaOf(info).real&&<p className="ni-real">◆ {metaOf(info).real}</p>}
          <div className="ni-ports">
            {ins(info).length>0&&<span>IN <b>{ins(info).join(', ')}</b></span>}
            {outs(info).length>0&&<span>OUT <b>{outs(info).join(', ')}</b></span>}
          </div>
        </div>}
        {openNode&&<InnerView node={openNode} onClose={()=>setOpenNode(null)} onFork={forkOpen} onSave={saveOpen} />}
        {openLambda&&<LambdaEditor node={openLambda} onApply={(g)=>applyLambda(openLambda.id,g)} onClose={()=>setOpenLambda(null)} />}
      </div>
      {hover&&<div className="node-tooltip" role="tooltip" style={{left:hover.x,top:hover.y,['--tip' as any]:colorOf(hover.type)}}>
        <div className="nt-cap">{metaOf(hover.type).cat} · PART GUIDE · 클릭하면 고정</div>
        <div className="nt-title">{metaOf(hover.type).label}</div>
        <p>{metaOf(hover.type).desc||'설명 준비 중.'}</p>
        {metaOf(hover.type).real&&<div className="nt-real">REAL WORLD · {metaOf(hover.type).real}</div>}
        <div className="nt-ports">
          {ins(hover.type).length>0&&<span>IN <b>{ins(hover.type).join(', ')}</b></span>}
          {outs(hover.type).length>0&&<span>OUT <b>{outs(hover.type).join(', ')}</b></span>}
        </div>
      </div>}
    </div>
  )
}

export function Editor(props:{initial:{nodes:RFNode[];edges:RFEdge[]};palette:string[];onGraph:(g:Graph)=>void;decorate?:Decorate;highlightPalette?:string;nodeDefaults?:Record<string,Record<string,number>>;requiredOutputs?:string[];onSkill?:(skill:string)=>void}){
  return <ReactFlowProvider><EditorInner {...props}/></ReactFlowProvider>
}
