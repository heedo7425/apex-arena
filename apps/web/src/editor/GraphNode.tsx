import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { portType, NT } from '@apex/core'
import { insOf, outsOf, metaOf, colorOf } from './nodeMeta'
import { useLive, usePending } from '../store'

const ROWH = 28

function portDetail(type:string,port:string,valueType:string){
  const units:Record<string,string>={speed:'m/s',yaw:'rad',psi:'rad',k:'1/m',kappa:'1/m',d:'m',distance:'m',width:'m',length:'m',step:'s',horizon:'s'}
  const frames:Record<string,string>={pose:'world frame',track:'world path',e:'signed/local value',steer:'normalized -1..1',throttle:'normalized -1..1'}
  return [port,valueType,units[port],frames[port]].filter(Boolean).join(' · ')
}

function fmt(v:any):string {
  if (v == null) return ''
  if (typeof v === 'number') return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2)
  if (Array.isArray(v)) return `[${v.length}]`
  if (typeof v === 'object') return v.x != null ? `${v.x.toFixed(1)}, ${v.y.toFixed(1)}` : '…'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

export function GraphNode({ id, data }:{ id:string; data:any }) {
  const type = data.coreType as string
  const meta = metaOf(type), col = colorOf(type)
  const inP = insOf(type, data), outP = outsOf(type, data)
  const storedLive = useLive((s) => (s.vals ? s.vals[id] : null))
  const live = data.liveOverride !== undefined ? data.liveOverride : storedLive
  const sel = usePending((s) => s.sel)
  const setParam = data.onParam as ((id:string,key:string,v:number)=>void)|undefined
  const onPort = data.onPort as ((id:string,handle:string,kind:'source'|'target')=>void)|undefined
  const onHover = data.onHover as ((type:string,el:HTMLElement)=>void)|undefined
  const onHoverEnd = data.onHoverEnd as (()=>void)|undefined
  const onOpen = data.onOpen as ((id:string,type:string,params:Record<string,any>)=>void)|undefined
  const onInspect = data.onInspect as ((id:string,type:string)=>void)|undefined
  const onVisualize = data.onVisualize as ((id:string,port:string)=>void)|undefined
  const visualized = new Set<string>(data.visualized||[])
  const nRows = Math.max(inP.length, outP.length, 1)
  const isComposite = !!NT[type]?.sub || !!data.params?.sub
  const headLabel = data.label || (type === 'blk.user' ? (data.params?.label || '▣ 내 블록') : meta.label)
  const outputLabel = (port:string) => data.outputLabels?.[port] ?? (type === "const" && port === "v" ? "value" : port)

  return (
    <div className={'gnode'+(data.highlight?' hl':'')+(data.issue?' issue':'')+(data.semanticCompact?' semantic-compact':'')+(data.activePath?' active-path':'')} style={{ ['--accent' as any]:col }} tabIndex={0}
      onMouseEnter={e=>{onHover?.(type,e.currentTarget);onInspect?.(id,type)}} onMouseLeave={onHoverEnd}
      onFocus={e=>{onHover?.(type,e.currentTarget);onInspect?.(id,type)}} onBlur={onHoverEnd} onClick={()=>onInspect?.(id,type)}
      onDoubleClick={e=>{if(onOpen){e.stopPropagation();onOpen(id,type,data.params)}}}>
      {data.issue&&<div className="issue-tag">연결 확인</div>}
      {data.highlight && <div className="hl-tag">{data.tag || '여기 ↓'}</div>}
      <div className={'gnode-h'+(isComposite?' composite':'')} style={{ background:col }}>{headLabel}{isComposite&&<span className="gnode-open">더블클릭 ▸ 열기</span>}</div>
      <div className="gnode-io" style={{ height:nRows*ROWH }}>
        {inP.map((p,i) => {
          const pType = portType(type,p,'in') || 'unknown'
          return <Handle key={'i'+p} id={p} type="target" position={Position.Left}
            className={sel===`${id}|${p}|target`?'armed':''}
            aria-label={`${meta.label} ${p} 입력, ${pType}`} title={portDetail(type,p,pType)}
            onClick={(e)=>{e.stopPropagation();onPort?.(id,p,'target')}}
            style={{top:i*ROWH+ROWH/2,background:col}}/>
        })}
        {outP.map((p,i) => {
          const pType = portType(type,p,'out') || 'unknown'
          return <Handle key={'o'+p} id={p} type="source" position={Position.Right}
            className={sel===`${id}|${p}|source`?'armed':''}
            aria-label={`${meta.label} ${outputLabel(p)} 출력, ${pType}`} title={portDetail(type,outputLabel(p),pType)}
            onClick={(e)=>{e.stopPropagation();onPort?.(id,p,'source')}}
            style={{top:i*ROWH+ROWH/2,background:col}}/>
        })}
        <div className="io-rows">
          {Array.from({length:nRows}).map((_,i)=>(
            <div className="io-row" key={i} style={{height:ROWH}}>
              <span className="pin">{inP[i]??''}</span>
              <span className="pout">
                {outP[i]?<><span className="pname">{outputLabel(outP[i])}</span>{live!=null&&<b>{fmt(live[outP[i]])}</b>}
                  {onVisualize&&<button className={'viz-port nodrag nowheel'+(visualized.has(outP[i])?' on':'')} title={`${outputLabel(outP[i])} 신호 Visualize`}
                    aria-label={`${meta.label} ${outputLabel(outP[i])} 신호 Visualize`}
                    onClick={e=>{e.stopPropagation();onVisualize(id,outP[i])}}>∿</button>}
                </>:''}
              </span>
            </div>
          ))}
        </div>
      </div>
      {meta.params && <div className="gparams">
        {meta.params.map(ps=>(
          <label key={ps.key}><span>{ps.label}</span>
            <input type="number" step={ps.step} min={ps.min} max={ps.max}
              aria-label={`${meta.label} ${ps.label}`}
              value={data.params[ps.key]??ps.def}
              onChange={e=>setParam?.(id,ps.key,parseFloat(e.target.value))}/><button className="param-reset nodrag" title={`${ps.label} 기본값 ${ps.def}`} onClick={e=>{e.stopPropagation();setParam?.(id,ps.key,ps.def)}}>↺</button>
          </label>
        ))}
      </div>}
    </div>
  )
}
