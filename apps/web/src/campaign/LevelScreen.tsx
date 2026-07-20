import React, { useEffect, useMemo, useRef, useState } from 'react'
import { buildWorld } from '@apex/core'
import type { Graph } from '@apex/core'

const COACH: React.ReactNode[] = [
  <><b>1단계.</b> 지금 <b>THROTTLE</b>이 비어서 차가 못 움직여. 왼쪽 팔레트에서 <b>Const</b>(반짝이는 칩)를 눌러 노드를 하나 추가해.</>,
  <><b>2단계.</b> 방금 만든 <b>Const</b>의 오른쪽 <b>v</b> 포트를 드래그해서 <b>▸ THROTTLE</b>의 <b>x</b> 포트에 연결해. (선이 이어져)</>,
  <><b>3단계.</b> 이제 <b>▶ 재생</b>! 네가 이은 스로틀로 차가 움직여 — 방금 <b>노드를 이어서 차를 굴린</b> 거야. (아직 속도 제어가 없어 코너에서 나가지만 괜찮아 — 그건 레벨 1에서 만들어.)</>,
  <><b>다 됐어!</b> 이게 그래프 코딩의 시작이야: <b>노드를 이으면 차의 행동이 생긴다.</b> 이제 속도 제어부터 직접 만들자!</>,
]
import { Editor } from '../editor/Editor'
import { coreToRF } from '../editor/compile'
import { Viewport } from '../sim/Viewport'
import { useGame, useLive, useTut } from '../store'
import { levelById, LEVELS, TUT_STARTER_N } from './levels'

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
  // from-scratch flow: add a node → wire it to THROTTLE → run
  useEffect(() => {
    if (!isTut) return
    if (coach === 0 && graph.order.length > TUT_STARTER_N) setCoach(1)
    else if (coach === 1 && throttleWired(graph)) setCoach(2)
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
        <Editor key={id} initial={initial} palette={level.palette} onGraph={setGraph}
          decorate={isTut ? { tsink: { label: '▸ THROTTLE', highlight: true, tag: '여기에 연결 ↓' } } : undefined}
          highlightPalette={isTut && coach === 0 ? 'const' : undefined} />
        <div className="lv-right">
          <Viewport world={world} graph={graph} autoplay={!isTut}
            onValues={(vals, info) => { setVals(vals); setHud({ speed: info.speed, best: info.best }); if (isTut && coach === 2 && info.speed > 2) setCoach(3) }}
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
