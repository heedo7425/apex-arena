import React, { useState } from 'react'
import { useTut } from './store'

const STEPS = [
  { n: '개요', h: '차의 두뇌를 그래프로 만든다', p: <>센서(LiDAR·속도·자세)가 들어오면 <b>조향·스로틀</b>을 뱉는 알고리즘을 노드로 조립합니다. 매 순간(tick) 그래프가 평가돼 차를 몹니다.</> },
  { n: '1 · 노드', h: '팔레트에서 노드 추가', p: <>왼쪽 <b>팔레트</b>의 칩을 누르면 캔버스에 노드가 생깁니다. 노드는 센서·수학·기하·제어 같은 작은 연산 하나.</> },
  { n: '2 · 배선', h: '포트를 드래그해 연결', p: <>노드의 <b>출력 포트</b>(오른쪽 점)를 다른 노드의 <b>입력 포트</b>(왼쪽 점)로 드래그. 데이터가 그 선을 따라 흐릅니다.</> },
  { n: '3 · 프로브', h: '실시간 값 보기', p: <>출력 포트 옆 숫자는 지금 그 와이어에 흐르는 <b>실시간 값</b>. 알고리즘이 뭘 계산하는지 그대로 보입니다.</> },
  { n: '4 · 실행', h: '▶ 재생 → 목표 달성', p: <>오른쪽 시뮬에서 재생하면 그래프대로 차가 달립니다. <b>클린 랩</b>(목표)을 달성하면 레벨 클리어 + 새 노드 언락.</> },
]

export function Tutorial() {
  const close = useTut((s) => s.close)
  const [i, setI] = useState(0)
  const last = i === STEPS.length - 1
  const s = STEPS[i]
  return (
    <div className="tut-overlay" onClick={close}>
      <div className="tut" onClick={(e) => e.stopPropagation()}>
        <div className="step-n">{s.n}</div>
        <h3>{s.h}</h3>
        <p>{s.p}</p>
        <div className="tut-nav">
          <div className="dots">{STEPS.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
          {i > 0 && <button onClick={() => setI(i - 1)}>이전</button>}
          {!last
            ? <button className="primary" onClick={() => setI(i + 1)}>다음</button>
            : <button className="primary" onClick={close}>시작하기</button>}
          {!last && <button onClick={close}>건너뛰기</button>}
        </div>
      </div>
    </div>
  )
}
