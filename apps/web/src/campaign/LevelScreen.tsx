import React, { useMemo, useState } from 'react'
import { buildWorld } from '@apex/core'
import type { Graph } from '@apex/core'
import { Editor } from '../editor/Editor'
import { coreToRF } from '../editor/compile'
import { Viewport } from '../sim/Viewport'
import { useGame, useLive } from '../store'
import { levelById, LEVELS } from './levels'

export function LevelScreen({ id }: { id: string }) {
  const level = levelById(id)
  const world = useMemo(() => buildWorld(), [])
  const initial = useMemo(() => coreToRF(level.starter), [id])
  const [graph, setGraph] = useState<Graph>(level.starter)
  const [hud, setHud] = useState({ speed: 0, best: null as number | null })
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const setVals = useLive((s) => s.setVals)
  const { complete, goMap, best } = useGame()
  const nextLevel = LEVELS.find(l => l.n === level.n + 1)

  const onLap = (t: number, dirty: boolean) => {
    if (dirty) { setResult({ ok: false, msg: `이탈 — 트랙을 벗어났어 (${t.toFixed(2)}s). 다시.` }); return }
    if (level.objective.type === 'time' && t > level.objective.target) {
      setResult({ ok: false, msg: `클린! 하지만 ${t.toFixed(2)}s — 목표 ${level.objective.target}s 이내로 더 빠르게.` }); return
    }
    complete(level.id, t)
    setResult({ ok: true, msg: `✓ 클리어! ${t.toFixed(2)}s` })
  }

  return (
    <div className="level">
      <div className="lv-top">
        <button className="back" onClick={goMap}>← 캠페인</button>
        <div className="lv-title"><b>Level {level.n}</b> · {level.title}</div>
        <div className="lv-best mono">best {best[level.id] != null ? best[level.id].toFixed(2) + 's' : '—'}</div>
      </div>
      <div className="lv-teach">{level.teach}</div>
      <div className="lv-body">
        <Editor key={id} initial={initial} palette={level.palette} onGraph={setGraph} />
        <div className="lv-right">
          <Viewport world={world} graph={graph}
            onValues={(vals, info) => { setVals(vals); setHud({ speed: info.speed, best: info.best }) }}
            onLap={onLap} />
          <div className="lv-hud mono">
            <span>속도 <b>{Math.round(hud.speed * 3.6)}</b> km/h</span>
            <span>목표 <b>{level.objective.type === 'time' ? `클린 ≤ ${level.objective.target}s` : '클린 랩 완주'}</b></span>
          </div>
          {result && (
            <div className={'lv-result ' + (result.ok ? 'ok' : 'bad')}>
              <span>{result.msg}</span>
              {result.ok && nextLevel && <button onClick={() => useGame.getState().goLevel(nextLevel.id)}>다음 레벨 →</button>}
              {result.ok && !nextLevel && <button onClick={goMap}>캠페인으로</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
