import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { ins, outs, metaOf, colorOf } from './nodeMeta'
import { useLive } from '../store'

function fmt(v: any): string {
  if (v == null) return '—'
  if (typeof v === 'number') return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2)
  if (Array.isArray(v)) return `[${v.length}]`
  if (typeof v === 'object') return v.x != null ? `${v.x.toFixed(1)},${v.y.toFixed(1)}` : '{}'
  return String(v)
}

export function GraphNode({ id, data }: { id: string; data: any }) {
  const type = data.coreType as string
  const meta = metaOf(type), col = colorOf(type)
  const inP = ins(type), outP = outs(type)
  const live = useLive((s) => (s.vals ? s.vals[id] : null))
  const setParam = data.onParam as (id: string, key: string, v: number) => void
  const rows = Math.max(inP.length, outP.length, 1)
  return (
    <div className="gnode" style={{ borderColor: col, minHeight: 30 + rows * 20 }}>
      <div className="gnode-h" style={{ background: col }}>{meta.label}</div>
      <div className="gnode-body">
        <div className="gports in">
          {inP.map((p, i) => (
            <div className="gport" key={p} style={{ top: 6 + i * 20 }}>
              <Handle id={p} type="target" position={Position.Left} style={{ background: col }} />
              <span>{p}</span>
            </div>
          ))}
        </div>
        <div className="gports out">
          {outP.map((p, i) => (
            <div className="gport out" key={p} style={{ top: 6 + i * 20 }}>
              <span>{p}{live ? ' ' : ''}<b>{live ? fmt(live[p]) : ''}</b></span>
              <Handle id={p} type="source" position={Position.Right} style={{ background: col }} />
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
