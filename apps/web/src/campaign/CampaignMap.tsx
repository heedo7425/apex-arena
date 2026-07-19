import React from 'react'
import { useGame, useTut } from '../store'
import { LEVELS } from './levels'

export function CampaignMap() {
  const { completed, best, goLevel } = useGame()
  const showTut = useTut((s) => s.show)
  const unlocked = (n: number) => n === 1 || completed.includes(LEVELS[n - 2].id)
  return (
    <div className="map">
      <div className="map-h">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <h1>APEX<b>·</b>ARENA</h1>
          <button className="help-btn" style={{ marginLeft: 'auto', marginTop: 6 }} title="튜토리얼" onClick={showTut}>?</button>
        </div>
        <p>데이터플로 그래프로 차의 두뇌를 짓는다. 레벨마다 새 노드를 열며 Pure Pursuit → Follow-the-Gap을 직접 조립.</p>
      </div>
      <div className="lvls">
        {LEVELS.map((l) => {
          const open = unlocked(l.n), done = completed.includes(l.id)
          return (
            <button key={l.id} className={'lvl-card' + (open ? '' : ' locked') + (done ? ' done' : '')}
              disabled={!open} onClick={() => open && goLevel(l.id)}>
              <div className="lvl-n">{done ? '✓' : l.n}</div>
              <div className="lvl-meta">
                <div className="lvl-title">{l.title}</div>
                <div className="lvl-obj mono">{l.objective.type === 'time' ? `클린 ≤ ${l.objective.target}s` : '클린 랩'}{best[l.id] != null ? ` · best ${best[l.id].toFixed(2)}s` : ''}</div>
              </div>
              <div className="lvl-go">{open ? '▶' : '🔒'}</div>
            </button>
          )
        })}
      </div>
      <div className="map-foot mono">Act 1 · 고전 컨트롤러 (다음 Act: MPPI · MPC · RL)</div>
    </div>
  )
}
