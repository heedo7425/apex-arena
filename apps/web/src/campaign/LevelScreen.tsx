import React, { useEffect, useMemo, useRef, useState } from 'react'
import { buildWorld } from '@apex/core'
import type { Graph } from '@apex/core'

const COACH: React.ReactNode[] = [
  <><b>1단계.</b> 오른쪽 시뮬에서 <b>▶ 재생</b>을 눌러봐. 차가 움직이기 시작해.</>,
  <><b>2단계.</b> 방금 이 <b>노드 그래프</b>가 차를 몬 거야. 노드 위 숫자는 실시간으로 흐르는 값. 이제 <b>목표속도 Const</b>(value 8) 노드의 숫자칸을 눌러 값을 <b>키워봐</b> → 차가 빨라져.</>,
  <><b>다 됐어!</b> 노드 하나가 차 거동을 바꾸지? 이게 핵심이야 — <b>그래프 = 차의 두뇌, 값이 흐르고, 바꾸면 반응한다.</b> 이제 직접 만들 차례!</>,
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
  // detect the player editing any node value (param change) to advance the tutorial
  const paramsSig = (g: Graph) => JSON.stringify(g.order.map(id => g.nodes[id].params || {}))
  const initSig = useRef<string | null>(null)
  useEffect(() => {
    if (!isTut) return
    const sig = paramsSig(graph)
    if (initSig.current === null) { initSig.current = sig; return }
    if (coach === 1 && sig !== initSig.current) setCoach(2)
  }, [graph, isTut, coach])
  const finishTut = () => { complete('tut', 60); useGame.getState().goLevel('l1'); }

  const onLap = (t: number, dirty: boolean) => {
    if (isTut) return  // tutorial is guided by the coach, not lap objectives
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
            onValues={(vals, info) => { setVals(vals); setHud({ speed: info.speed, best: info.best }); if (isTut && coach === 0 && info.speed > 2) setCoach(1) }}
            onLap={onLap} />
          {isTut && (
            <div className="coach">
              <div className="coach-n">튜토리얼 · {coach + 1}/{COACH.length}</div>
              <p>{COACH[coach]}</p>
              {coach === COACH.length - 1 && <button className="coach-go" onClick={finishTut}>레벨 1로 →</button>}
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
