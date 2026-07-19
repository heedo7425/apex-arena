import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, addEdge,
  useNodesState, useEdgesState, type Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GraphNode } from './GraphNode'
import { newNode, rfToCore, type RFNode, type RFEdge } from './compile'
import { defaultParams, metaOf, colorOf, ins, outs, PALETTE_CATS } from './nodeMeta'
import type { Graph } from '@apex/core'

const nodeTypes = { apex: GraphNode }

function EditorInner({ initial, palette, onGraph }:
  { initial: { nodes: RFNode[]; edges: RFEdge[] }; palette: string[]; onGraph: (g: Graph) => void }) {

  const onParam = useCallback((id: string, key: string, val: number) => {
    setNodes((nds: any) => nds.map((n: any) => n.id === id ? { ...n, data: { ...n.data, params: { ...n.data.params, [key]: val } } } : n))
    // eslint-disable-next-line
  }, [])
  const withCb = (ns: RFNode[]) => ns.map(n => ({ ...n, data: { ...n.data, onParam } }))

  const [nodes, setNodes, onNodesChange] = useNodesState(withCb(initial.nodes) as any)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges as any)
  const [info, setInfo] = useState<string | null>(null)

  const onConnect = useCallback((c: Connection) => {
    setEdges((eds: any) => addEdge({ ...c, id: `${c.source}.${c.sourceHandle}->${c.target}.${c.targetHandle}` }, eds))
  }, [setEdges])

  // recompile ONLY on structural change (not on live-value updates)
  const sigRef = useRef('')
  useEffect(() => {
    const sig = JSON.stringify([nodes.map((n: any) => [n.id, n.data.coreType, n.data.params]),
      edges.map((e: any) => [e.source, e.sourceHandle, e.target, e.targetHandle])])
    if (sig !== sigRef.current) { sigRef.current = sig; onGraph(rfToCore(nodes as any, edges as any)) }
  }, [nodes, edges, onGraph])

  const addNode = (type: string) => {
    const nn = newNode(type, 40 + Math.random() * 100, 30 + Math.random() * 120)
    setNodes((nds: any) => nds.concat({ ...nn, data: { coreType: type, params: defaultParams(type), onParam } }))
  }

  return (
    <div className={'editor' + (palette.length ? '' : ' no-pal')}>
      {palette.length > 0 && <div className="palette">
        <div className="palette-h">노드 팔레트</div>
        {PALETTE_CATS.map(g => {
          const types = g.types.filter(t => palette.includes(t))
          if (!types.length) return null
          return (
            <div className="pal-cat" key={g.cat}>
              <div className="pal-cat-h" style={{ color: colorOf(types[0]) }}>{g.cat}</div>
              <div className="pal-chips">
                {types.map(t => (
                  <button key={t} className="pal-chip" onClick={() => addNode(t)} onMouseEnter={() => setInfo(t)}
                    style={{ borderColor: colorOf(t) }}>{metaOf(t).label}</button>
                ))}
              </div>
            </div>
          )
        })}
        <div className="pal-note">칩을 눌러 노드 추가 · 포트를 드래그해 연결 · 노드 선택 후 Del 삭제</div>
      </div>}
      <div className="rf-wrap">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeClick={(_, node: any) => setInfo(node.data.coreType)}
          fitView minZoom={0.3} maxZoom={2} proOptions={{ hideAttribution: true }}>
          <Background color="#222c38" gap={22} />
          <Controls showInteractive={false} />
        </ReactFlow>
        <div className="node-info">
          {info ? (
            <>
              <div className="ni-h" style={{ color: colorOf(info) }}>{metaOf(info).label}<span className="ni-cat">{metaOf(info).cat}</span></div>
              <p>{metaOf(info).desc || '설명 준비 중.'}</p>
              {metaOf(info).real && <p className="ni-real">◆ {metaOf(info).real}</p>}
              <div className="ni-ports">
                {ins(info).length > 0 && <span>입력 <b>{ins(info).join(', ')}</b></span>}
                {outs(info).length > 0 && <span>출력 <b>{outs(info).join(', ')}</b></span>}
              </div>
            </>
          ) : <span className="ni-hint">노드를 클릭하거나 팔레트 칩에 마우스를 올리면 설명이 나와요.</span>}
        </div>
      </div>
    </div>
  )
}

export function Editor(props: { initial: { nodes: RFNode[]; edges: RFEdge[] }; palette: string[]; onGraph: (g: Graph) => void }) {
  return <ReactFlowProvider><EditorInner {...props} /></ReactFlowProvider>
}
