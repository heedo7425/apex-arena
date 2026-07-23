import React from 'react'
import { useGame, useTut } from '../store'
import { ACADEMY_LEVELS } from '../campaign/levels'

export function AcademyMap(){
  const {completed,goLevel,goMap}=useGame()
  const showConcepts=useTut(s=>s.show)
  return <main className="academy-map">
    <header className="academy-hero">
      <button className="back" onClick={goMap}>← 메인</button>
      <span className="eyebrow">OPTIONAL HANDS-ON COURSE</span>
      <h1>GRAPH <em>ACADEMY</em></h1>
      <p>설명을 읽는 대신 직접 놓고, 연결하고, 실행합니다. 순서대로 해도 되고 필요한 조작만 골라 연습해도 됩니다.</p>
      <button className="map-secondary" onClick={showConcepts}>개념 설명 다시 보기</button>
    </header>
    <section className="academy-levels" aria-label="그래프 실습 레벨">
      {ACADEMY_LEVELS.map((level,index)=>{const done=completed.includes(level.id);return <article key={level.id} className={'academy-card'+(done?' done':'')}>
        <div className="academy-num">A{String(index+1).padStart(2,'0')}</div>
        <span className="eyebrow">{level.kicker}</span><h2>{level.title}</h2><p>{level.teach}</p>
        <div><b>{done?'COMPLETE':'PRACTICE'}</b><span>{level.unlock}</span></div>
        <button onClick={()=>goLevel(level.id)}>{done?'다시 연습':'실습 시작'} →</button>
      </article>})}
    </section>
  </main>
}
