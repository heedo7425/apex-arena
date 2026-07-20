import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { ins, outs, metaOf, colorOf } from './nodeMeta'
import { useLive, usePending } from '../store'

const HEADER = 26, ROWH = 22

function fmt(v: any): string {
  if (v == null) return ''
  if (typeof v === 'number') return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2)
  if (Array.isArray(v)) return `[${v.length}]`
  if (typeof v === 'object') return v.x != null ? `${v.x.toFixed(1)}, ${v.y.toFixed(1)}` : '…'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v)
}

export function GraphNode({ id, data }: { id: string; data: any }) {
  const type = data.coreType as string
  const meta = metaOf(type), col = colorOf(type)
  const inP = ins(type), outP = outs(type)
  const live = useLive((s) => (s.vals ? s.vals[id] : null))
  const sel = usePending((s) => s.sel)
  const setParam = data.onParam as ((id: string, key: string, v: number) => void) | undefined
  const onPort = data.onPort as ((id: string, handle: string, kind: 'source' | 'target') => void) | undefined
  const nRows = Math.max(inP.length, outP.length, 1)

  return (
    <div className={'gnode' + (data.highlight ? ' hl' : '')} style={{ ['--accent' as any]: col }}>
      {data.highlight && <div className="hl-tag">{data.tag || '여기 ↓'}</div>}
      <div className="gnode-h" style={{ background: col }}>{data.label || meta.label}</div>
      <div className="gnode-io" style={{ height: nRows * ROWH }}>
        {inP.map((p, i) => (
          <Handle key={'i' + p} id={p} type="target" position={Position.Left}
            className={sel === `${id}|${p}|target` ? 'armed' : ''}
            onClick={(e) => { e.stopPropagation(); onPort?.(id, p, 'target') }}
            style={{ top: HEADER + i * ROWH + ROWH / 2, background: col }} />
        ))}
        {outP.map((p, i) => (
          <Handle key={'o' + p} id={p} type="source" position={Position.Right}
            className={sel === `${id}|${p}|source` ? 'armed' : ''}
            onClick={(e) => { e.stopPropagation(); onPort?.(id, p, 'source') }}
            style={{ top: HEADER + i * ROWH + ROWH / 2, background: col }} />
        ))}
        <div className="io-rows">
          {Array.from({ length: nRows }).map((_, i) => (
            <div className="io-row" key={i} style={{ height: ROWH }}>
              <span className="pin">{inP[i] ?? ''}</span>
              <span className="pout">
                {outP[i] ? <><span className="pname">{outP[i]}</span>{live != null && <b>{fmt(live[outP[i]])}</b>}</> : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
      {meta.params && (
        <div className="gparams">
          {meta.params.map((ps) => (
            <label key={ps.key}>
              <span>{ps.label}</span>
              <input type="number" step={ps.step} min={ps.min} max={ps.max}
                value={data.params[ps.key] ?? ps.def}
                onChange={(e) => setParam?.(id, ps.key, parseFloat(e.target.value))} />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
