import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, addEdge,
  useNodesState, useEdgesState, useReactFlow, type Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GraphNode } from './GraphNode'
import { connectionIssue, graphReady, newNode, rfToCore, type RFNode, type RFEdge } from './compile'
import { defaultParams, metaOf, colorOf, ins, outs, PALETTE_CATS } from './nodeMeta'
import { usePending } from '../store'
import type { Graph } from '@apex/core'

const nodeTypes = { apex: GraphNode }

type Decorate = Record<string, { label?: string; highlight?: boolean; tag?: string }>
type HoverInfo = { type:string; x:number; y:number }
function EditorInner({ initial, palette, onGraph, decorate, highlightPalette, nodeDefaults, requiredOutputs }:
  { initial:{nodes:RFNode[];edges:RFEdge[]}; palette:string[]; onGraph:(g:Graph)=>void; decorate?:Decorate; highlightPalette?:string; nodeDefaults?:Record<string,Record<string,number>>; requiredOutputs?:string[] }) {

  const { fitView } = useReactFlow()
  const frameBuild = () => requestAnimationFrame(() => fitView({ padding:0.2, duration:250 }))
  const compact = typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  const arranged = compact ? initial.nodes.map((n,i)=>({...n,position:{x:10+(i%2)*185,y:70+Math.floor(i/2)*105}})) : initial.nodes
  const latest = useRef<{nodes:RFNode[];edges:RFEdge[]}>({nodes:arranged,edges:initial.edges})
  const [notice,setNotice] = useState<string|null>(null)
  const [bayOpen,setBayOpen] = useState(true)
  const [info,setInfo]=useState<string|null>(null)
  const [hover,setHover]=useState<HoverInfo|null>(null)
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

  const addNode=(type:string)=>{
    remember()
    const index=nodes.length
    const nn=newNode(type,compact?10+(index%2)*185:70+(index%3)*210,compact?70+Math.floor(index/2)*105:70+(Math.floor(index/3)%4)*110)
    setNodes((nds:any)=>nds.concat({...nn,data:{coreType:type,params:{...defaultParams(type),...(nodeDefaults?.[type]??{})},onParam,onPort,onHover:showHover,onHoverEnd:hideHover}}))
    setNotice(`${metaOf(type).label} 파트를 장착했습니다.`)
    if(compact)setBayOpen(false)
    frameBuild()
  }

  const ready=graphReady(nodes as any,edges as any,requiredOutputs)

  return (
    <div className="editor">
      <div className="editor-mode"><span>BUILD MODE</span><b>CONTROL GRAPH</b></div>
      {palette.length>0&&<button className={'parts-toggle'+(highlightPalette?' hl':'')} onClick={()=>setBayOpen(v=>!v)} aria-expanded={bayOpen}>
        <span className="parts-icon">＋</span><span><small>LOADOUT</small><b>PARTS BAY</b></span><em>{palette.length}</em>
      </button>}
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
        <div className="pal-note">파트 선택 → 캔버스 장착 → 신호 포트 체결</div>
      </div>}
      <div className="rf-wrap">
        <div className="editor-actions">
          <button onClick={undo} disabled={undoCount === 0} aria-label="마지막 변경 되돌리기">↶ UNDO</button>
          <button onClick={resetBuild} aria-label="미션 그래프 초기화">↻ RESET</button>
        </div>
        <div className={'graph-feedback '+(notice?'active':ready?'ready':'waiting')} role="status" aria-live="polite">
          <span className="gf-dot"/>{notice||(ready?'CONTROL ONLINE · 출전 준비 완료':'CONTROL OFFLINE · 출력 링크를 완성하세요')}
        </div>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange} onConnect={onConnect}
          isValidConnection={c=>!!c.source&&!!c.sourceHandle&&!!c.target&&!!c.targetHandle&&!connectionIssue(latest.current.nodes,latest.current.edges,c.source,c.sourceHandle,c.target,c.targetHandle)}
          onNodeClick={(_,node:any)=>{setHover(null);setInfo(node.data.coreType)}} onPaneClick={clearPending}
          fitView minZoom={0.3} maxZoom={2} proOptions={{hideAttribution:true}}>
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
