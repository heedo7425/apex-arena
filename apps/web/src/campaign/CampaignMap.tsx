import React from 'react'
import { useGame, useTut } from '../store'
import { LEVELS } from './levels'

export function CampaignMap() {
  const { completed, best, goLevel } = useGame()
  const showTut = useTut((s) => s.show)
  const isOpen = (i:number) => i === 0 || completed.includes(LEVELS[i-1].id)
  const cleared = LEVELS.filter(l => completed.includes(l.id)).length
  const progress = Math.round((cleared / LEVELS.length) * 100)

  return (
    <main className="map">
      <header className="map-h">
        <div className="brand-line">
          <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
          <div><span className="eyebrow">AUTONOMOUS RACING LAB</span><h1>APEX<b>·</b>ARENA</h1></div>
        </div>
        <h2>차의 두뇌를 짓고,<br/><em>트랙에서 증명하세요.</em></h2>
        <p>센서에서 제어 출력까지 계산을 직접 연결합니다. 각 미션은 실제 자율주행 알고리즘의 한 조각을 열어줍니다.</p>
        <div className="map-actions">
          <button className="map-primary" onClick={() => goLevel(LEVELS[Math.min(cleared, LEVELS.length-1)].id)}>
            {cleared ? '계속하기' : '첫 시동 걸기'} <span>→</span>
          </button>
          <button className="map-secondary" onClick={showTut}>그래프 사용법</button>
        </div>
        <div className="progress-block">
          <div><span>ACT 01 · CLASSIC CONTROL</span><b>{cleared}/{LEVELS.length} MISSIONS</b></div>
          <div className="progress-track"><i style={{ width:progress+'%' }} /></div>
        </div>
      </header>

      <section className="campaign" aria-label="캠페인 미션">
        <div className="campaign-line" aria-hidden="true" />
        {LEVELS.map((level, index) => {
          const open = isOpen(index), done = completed.includes(level.id)
          return (
            <article key={level.id} className={'mission-card '+(open?'open':'locked')+(done?' done':'')}>
              <div className="mission-index">{done ? '✓' : String(level.n).padStart(2,'0')}</div>
              <button disabled={!open} onClick={() => open && goLevel(level.id)}>
                <div className="mission-card-top">
                  <span className="eyebrow">{level.kicker}</span>
                  <span className={'status '+(done?'complete':open?'available':'locked')}>{done?'COMPLETE':open?'AVAILABLE':'LOCKED'}</span>
                </div>
                <h3>{level.title}</h3>
                <p>{level.teach}</p>
                <div className="mission-reward">
                  <span>UNLOCK</span><b>{level.unlock}</b>
                  {best[level.id] != null && <em className="mono">BEST {best[level.id].toFixed(2)}s</em>}
                </div>
              </button>
            </article>
          )
        })}
      </section>
      <footer className="map-foot">
        <span className="eyebrow">NEXT ACT</span>
        <b>Sampling & Prediction</b>
        <p>MPPI · MPC · Reinforcement Learning</p>
      </footer>
    </main>
  )
}
