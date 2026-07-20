import React, { useState } from 'react'
import { useTut } from './store'

const STEPS = [
  { n:'개요', h:'센서에서 행동까지, 선으로 연결합니다', p:<>센서가 만든 데이터를 수학·기하·제어 노드에 흘려보내 <b>STEER와 THROTTLE</b>을 계산합니다.</> },
  { n:'1 · 노드', h:'팔레트에서 필요한 계산을 꺼냅니다', p:<>왼쪽 팔레트의 칩을 누르면 겹치지 않는 위치에 노드가 추가됩니다. 노드를 클릭하면 역할과 실제 로보틱스 의미를 볼 수 있어요.</> },
  { n:'2 · 연결', h:'포트를 차례로 클릭합니다', p:<>출력 포트를 클릭한 뒤 호환되는 입력 포트를 클릭하세요. 드래그도 가능합니다. 맞지 않는 타입이면 이유를 바로 알려줍니다.</> },
  { n:'3 · 관찰', h:'실시간 값으로 생각을 들여다봅니다', p:<>실행 중 출력 포트 옆 숫자가 계속 변합니다. 차량이 왜 그렇게 움직였는지 그래프에서 역추적할 수 있어요.</> },
  { n:'4 · 실행', h:'준비 신호가 켜지면 트랙으로', p:<>필수 연결이 끝나면 <b>실행 준비됨</b>이 표시됩니다. 실행하고 목표를 달성하면 다음 알고리즘이 열립니다.</> },
]

export function Tutorial() {
  const close = useTut((s) => s.close)
  const [i, setI] = useState(0)
  const last = i === STEPS.length-1, step = STEPS[i]
  return (
    <div className="tut-overlay" onClick={close}>
      <div className="tut" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" onClick={e => e.stopPropagation()}>
        <button className="tut-close" aria-label="도움말 닫기" onClick={close}>×</button>
        <div className="step-n">{step.n}</div>
        <h3 id="tutorial-title">{step.h}</h3>
        <p>{step.p}</p>
        <div className="tut-nav">
          <div className="dots" aria-label={`${i+1}/${STEPS.length}`}>{STEPS.map((_,k)=><i key={k} className={k===i?'on':''}/>)}</div>
          {i>0 && <button onClick={()=>setI(i-1)}>이전</button>}
          {!last ? <button className="primary" onClick={()=>setI(i+1)}>다음</button> : <button className="primary" onClick={close}>확인</button>}
        </div>
      </div>
    </div>
  )
}
