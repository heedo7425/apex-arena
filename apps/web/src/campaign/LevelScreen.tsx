import React, { useEffect, useMemo, useState } from 'react'
import { buildWorld } from '@apex/core'
import type { Graph } from '@apex/core'

const COACH: React.ReactNode[] = [
  <>왼쪽 아래 <b>Const (0.4)</b> 노드의 오른쪽 <b>v</b> 포트를 드래그해서 <b>▸ THROTTLE</b>의 <b>x</b> 포트에 연결해봐. (스로틀이 있어야 차가 움직여)</>,
  <>연결됐어! 이제 오른쪽 시뮬에서 <b>▶ 재생</b>을 눌러 차를 움직여봐.</>,
  <>달린다! 노드 출력 옆 숫자가 <b>실시간 값</b>이야 — 알고리즘이 계산하는 걸 그대로 보여줘. 한 바퀴 완주하면 클리어! (Const 값을 키우면 더 빨라져)</>,
]
import { Editor } from '../editor/Editor'
import { coreToRF } from '../editor/compile'
import { Viewport } from '../sim/Viewport'
import { useGame, useLive, useTut } from '../store'
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
  const isTut = level.id === 'tut'
  const [coach, setCoach] = useState(0)
  const throttleWired = (g: Graph) => { const id = g.order.find(n => g.nodes[n].type === 'sink.throttle'); return !!(id && g.nodes[id].in && (g.nodes[id].in as any).x) }
  useEffect(() => { if (isTut && coach === 0 && throttleWired(graph)) setCoach(1) }, [graph, isTut, coach])

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
        <div className="lv-best mono" style={{ marginLeft: 'auto' }}>best {best[level.id] != null ? best[level.id].toFixed(2) + 's' : '—'}</div>
        <button className="help-btn" title="튜토리얼" onClick={() => useTut.getState().show()}>?</button>
      </div>
      <div className="lv-teach">{level.teach}</div>
      <div className="lv-body">
        <Editor key={id} initial={initial} palette={level.palette} onGraph={setGraph} />
        <div className="lv-right">
          <Viewport world={world} graph={graph}
            onValues={(vals, info) => { setVals(vals); setHud({ speed: info.speed, best: info.best }); if (isTut && coach === 1 && info.speed > 2) setCoach(2) }}
            onLap={onLap} />
          {isTut && !result && (
            <div className="coach">
              <div className="coach-n">가이드 {coach + 1}/{COACH.length}</div>
              <p>{COACH[coach]}</p>
            </div>
          )}
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
