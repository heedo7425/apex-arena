import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, addEdge,
  useNodesState, useEdgesState, useReactFlow, type Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GraphNode } from './GraphNode'
import { connectionIssue, graphReady, newNode, rfToCore, coreToRF, type RFNode, type RFEdge } from './compile'
import { defaultParams, metaOf, colorOf, ins, outs, PALETTE_CATS } from './nodeMeta'
import { usePending } from '../store'
import { NT, inlineComposite, encapsulate, type Graph } from '@apex/core'

const nodeTypes = { apex: GraphNode }

type OpenNode = { id:string; type:string; label:string; sub:Graph }
// Read-only drill-in view of a composite block's inner sub-graph.
function InnerView({ node, onClose, onFork }: { node:OpenNode; onClose:()=>void; onFork:()=>void }) {
  const g = React.useMemo(() => coreToRF(node.sub), [node.sub])
  return (
    <div className="inner-view">
      <div className="inner-bar">
        <button className="iv-close" onClick={onClose}>← 닫기</button>
        <span className="iv-title">{node.label} <em>· 내부 (읽기전용)</em></span>
        <button className="iv-fork" onClick={onFork} title="이 블록을 풀어서 내 그래프에 붙여넣기">펼쳐서 내 그래프로 ⤢</button>
      </div>
      <div className="inner-flow">
        <ReactFlowProvider>
          <ReactFlow nodes={g.nodes as any} edges={g.edges as any} nodeTypes={nodeTypes}
            fitView minZoom={0.4} maxZoom={2} nodesDraggable={false} nodesConnectable={false}
            elementsSelectable={false} proOptions={{ hideAttribution:true }}>
            <Background color="#314052" gap={24} size={1} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  )
}

type Decorate = Record<string, { label?: string; highlight?: boolean; tag?: string }>
type HoverInfo = { type:string; x:number; y:number }
function EditorInner({ initial, palette, onGraph, decorate, highlightPalette, nodeDefaults, requiredOutputs }:
  { initial:{nodes:RFNode[];edges:RFEdge[]}; palette:string[]; onGraph:(g:Graph)=>void; decorate?:Decorate; highlightPalette?:string; nodeDefaults?:Record<string,Record<string,number>>; requiredOutputs?:string[] }) {

  const { fitView } = useReactFlow()
  const frameBuild = () => requestAnimationFrame(() => fitView({ padding:0.2, duration:250 }))
  const compact = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  const arranged = compact ? initial.nodes.map((n,i)=>({...n,position:{x:10+(i%2)*225,y:70+Math.floor(i/2)*138}})) : initial.nodes
  const latest = useRef<{nodes:RFNode[];edges:RFEdge[]}>({nodes:arranged,edges:initial.edges})
  const [notice,setNotice] = useState<string|null>(null)
  const [bayOpen,setBayOpen] = useState(true)
  const [info,setInfo]=useState<string|null>(null)
  const [openNode,setOpenNode]=useState<OpenNode|null>(null)
  const [selectedIds,setSelectedIds]=useState<string[]>([])
  const blockUid=useRef(1)
  const [hover,setHover]=useState<HoverInfo|null>(null)
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
    remember()
    setNodes((nds:any)=>nds.map((n:any)=>n.id===id?{...n,data:{...n.data,params:{...n.data.params,[key]:val}}}:n))
    // eslint-disable-next-line
  },[])
  const pending = useRef<{node:string;handle:string;kind:'source'|'target'}|null>(null)
  const deleteNode = useCallback((id:string, save=true)=>{
    if(save)remember()
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
      setNotice('링크 체결 완료 · 데이터 신호가 흐릅니다.')
      pending.current=null;usePending.getState().setSel(null)
    }else{
      pending.current={node,handle,kind};usePending.getState().setSel(`${node}|${handle}|${kind}`)
      setNotice(kind==='source'?'신호를 받을 입력 포트를 선택하세요.':'신호를 보낼 출력 포트를 선택하세요.')
    }
    // eslint-disable-next-line
  },[])
  const clearPending=()=>{pending.current=null;usePending.getState().setSel(null);setNotice(null)}
  const showHover=(type:string, el:HTMLElement)=>{
    const box=el.getBoundingClientRect(), width=286, height=190, gap=12
    const right=box.right+gap, left=box.left-width-gap
    setHover({type,x:right+width<window.innerWidth?right:Math.max(8,left),y:Math.max(8,Math.min(box.top,window.innerHeight-height-8))})
  }
  const hideHover=()=>setHover(null)
  const withCb=(ns:RFNode[])=>ns.map(n=>({...n,data:{...n.data,onParam,onPort,onHover:showHover,onHoverEnd:hideHover,...(decorate?.[n.id]||{})}}))

  const [nodes,setNodes,onNodesChange]=useNodesState(withCb(arranged) as any)
  const [edges,setEdges,onEdgesChange]=useEdgesState(initial.edges as any)
  const handleNodesChange = (changes:any[]) => {
    if (changes.some(c => c.type === 'remove')) remember()
    onNodesChange(changes)
  }
  const handleEdgesChange = (changes:any[]) => {
    if (changes.some(c => c.type === 'remove')) remember()
    onEdgesChange(changes)
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
    setNotice('링크 체결 완료 · 데이터 신호가 흐릅니다.')
  },[setEdges])

  const sigRef=useRef('')
  useEffect(()=>{
    const sig=JSON.stringify([nodes.map((n:any)=>[n.id,n.data.coreType,n.data.params]),edges.map((e:any)=>[e.source,e.sourceHandle,e.target,e.targetHandle])])
    if(sig!==sigRef.current){sigRef.current=sig;onGraph(rfToCore(nodes as any,edges as any))}
  },[nodes,edges,onGraph])

  const forkOpen = () => {
    if(!openNode) return
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
    setOpenNode({ id, type, label, sub })
  }
  const groupSelected = () => {
    const ids = selectedIds.filter(id => latest.current.nodes.some(n=>n.id===id))
    if(ids.length < 2) return
    const core = rfToCore(latest.current.nodes as any, latest.current.edges as any)
    const blockId = `blk_${blockUid.current++}`
    const grouped = encapsulate(core, ids, blockId, NT)
    if(grouped.nodes[blockId] === undefined){ setNotice('이 노드들은 블록으로 묶을 수 없어요.'); return }
    const rf = coreToRF(grouped)
    remember(); setNodes(withCb(rf.nodes) as any); setEdges(rf.edges as any)
    setSelectedIds([]); setNotice(`${ids.length}개 노드를 블록으로 묶었어요. (더블클릭해 열기)`); frameBuild()
  }
  const addNode=(type:string)=>{
    remember()
    const index=nodes.length
    const nn=newNode(type,compact?10+(index%2)*225:70+(index%3)*260,compact?70+Math.floor(index/2)*138:70+(Math.floor(index/3)%4)*128)
    setNodes((nds:any)=>nds.concat({...nn,data:{coreType:type,params:{...defaultParams(type),...(nodeDefaults?.[type]??{})},onParam,onPort,onHover:showHover,onHoverEnd:hideHover}}))
    setNotice(`${metaOf(type).label} 파트를 장착했습니다.`)
    if(compact)setBayOpen(false)
    frameBuild()
  }

  const renderedNodes = (nodes as RFNode[]).map(n => {
    if (n.data.coreType !== 'const') return n
    const targets = [...new Set((edges as RFEdge[]).filter(e => e.source === n.id && e.sourceHandle === 'v').map(e => e.targetHandle))]
    const label = targets.length === 1 ? "value → " + targets[0] : "value"
    return {...n,data:{...n.data,outputLabels:{v:label}}}
  })
  const ready=graphReady(nodes as any,edges as any,requiredOutputs)

  return (
    <div className="editor">
      {palette.length>0&&bayOpen&&<div className="palette parts-bay">
        <div className="parts-head">
          <div><span>GARAGE LOADOUT</span><b>제어 파트 장착</b></div>
          <button aria-label="파트 베이 닫기" onClick={()=>setBayOpen(false)}>×</button>
        </div>
        <div className="parts-grid">
          {PALETTE_CATS.map(g=>{
            const types=g.types.filter(t=>palette.includes(t))
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
        </div>
        <div className="pal-note">파트 선택 → 캔버스 장착 → 신호 포트 체결 · 빈 곳 드래그로 여러 노드 선택 → <b>블록으로 묶기</b> · 블록을 휴지통에 드롭</div>
      </div>}
      <div className="rf-wrap">
        <div className="editor-actions">
          {selectedIds.length>=2 && <button className="group-btn" onClick={groupSelected} aria-label="선택한 노드를 블록으로 묶기">▣ 블록으로 묶기 ({selectedIds.length})</button>}
          <button onClick={undo} disabled={undoCount === 0} aria-label="마지막 변경 되돌리기">↶ UNDO</button>
          <button onClick={resetBuild} aria-label="미션 그래프 초기화">↻ RESET</button>
        </div>
        <div className="editor-topbar">
          {palette.length>0&&!bayOpen&&<button className={'parts-toggle'+(highlightPalette?' hl':'')} onClick={()=>setBayOpen(true)} aria-expanded={bayOpen}>
            <span className="parts-icon">＋</span><span><small>LOADOUT</small><b>PARTS BAY</b></span><em>{palette.length}</em>
          </button>}
          <div className="gf-slot">
            <div className={'graph-feedback '+(notice?'active':ready?'ready':'waiting')} role="status" aria-live="polite">
              <span className="gf-dot"/>{notice||(ready?'CONTROL ONLINE · 출전 준비 완료':'CONTROL OFFLINE · 출력 링크를 완성하세요')}
            </div>
          </div>
          <div className="editor-mode"><span>BUILD MODE</span><b>CONTROL GRAPH</b></div>
        </div>
        <div ref={trashRef} className={`trash-drop${draggingNode?" dragging":""}${trashHot?" hot":""}`} aria-label="블록 삭제 영역">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg><span>{trashHot?"놓아서 삭제":"여기로 끌어 삭제"}</span>
        </div>
        <ReactFlow nodes={renderedNodes} edges={edges} nodeTypes={nodeTypes} deleteKeyCode={["Backspace","Delete"]}
          onNodeDragStart={()=>{remember();setDraggingNode(true)}} onNodeDrag={e=>setTrashHot(isOverTrash(e))}
          onNodeDragStop={(e,node)=>{const remove=isOverTrash(e);setDraggingNode(false);setTrashHot(false);if(remove)deleteNode(node.id,false)}}
          onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange} onConnect={onConnect}
          onSelectionChange={({nodes:sel}:any)=>setSelectedIds(sel.map((n:any)=>n.id))}
          selectionOnDrag panOnDrag={[1,2]} selectionKeyCode={null} multiSelectionKeyCode={["Shift","Meta"]}
          isValidConnection={c=>!!c.source&&!!c.sourceHandle&&!!c.target&&!!c.targetHandle&&!connectionIssue(latest.current.nodes,latest.current.edges,c.source,c.sourceHandle,c.target,c.targetHandle)}
          onNodeClick={(_,node:any)=>{setHover(null);setInfo(node.data.coreType)}} onPaneClick={clearPending}
          onNodeDoubleClick={(_,node:any)=>openBlock(node.id,node.data.coreType)}
          fitView minZoom={0.58} maxZoom={2} proOptions={{hideAttribution:true}}>
          <Background color="#314052" gap={24} size={1}/>
          <Controls showInteractive={false}/>
        </ReactFlow>
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
        {openNode&&<InnerView node={openNode} onClose={()=>setOpenNode(null)} onFork={forkOpen} />}
      </div>
      {hover&&<div className="node-tooltip" role="tooltip" style={{left:hover.x,top:hover.y,['--tip' as any]:colorOf(hover.type)}}>
        <div className="nt-cap">{metaOf(hover.type).cat} · PART GUIDE</div>
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

export function Editor(props:{initial:{nodes:RFNode[];edges:RFEdge[]};palette:string[];onGraph:(g:Graph)=>void;decorate?:Decorate;highlightPalette?:string;nodeDefaults?:Record<string,Record<string,number>>;requiredOutputs?:string[]}){
  return <ReactFlowProvider><EditorInner {...props}/></ReactFlowProvider>
}
