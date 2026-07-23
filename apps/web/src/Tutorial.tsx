import React, { useState } from 'react'
import { useGame, useTut } from './store'

type Step = {
  n:string; eyebrow:string; h:string; p:React.ReactNode; remember:string
  flow?:string[]; cards?:{title:string;body:string;tone?:string}[]
}

const STEPS:Step[] = [
  {n:'00',eyebrow:'MENTAL MODEL',h:'차량의 두뇌는 정보의 흐름입니다',p:<>자율주행 알고리즘은 마법 같은 한 함수가 아닙니다. 센서로 <b>관찰</b>하고, 값을 <b>계산·판단</b>한 뒤, 조향과 가속이라는 <b>행동</b>을 반복합니다.</>,remember:'모든 그래프는 관찰에서 시작해 행동으로 끝납니다.',flow:['관찰 SENSOR','계산 COMPUTE','판단 DECIDE','행동 ACT']},
  {n:'01',eyebrow:'SIGNAL',h:'선은 값이 이동하는 방향입니다',p:<>노드는 값을 만들거나 바꾸고, 연결선은 그 값을 다음 노드로 보냅니다. 출력 포트에서 입력 포트로만 흐르며 매 simulation tick마다 다시 계산됩니다.</>,remember:'노드는 계산, 포트는 출입구, 선은 데이터 흐름입니다.',flow:['Speed · 6.2 m/s','목표 - 현재','PID · 0.73','THROTTLE']},
  {n:'02',eyebrow:'TYPE · UNIT · FRAME',h:'숫자라고 전부 같은 값은 아닙니다',p:<><b>타입</b>은 값의 모양, <b>단위</b>는 측정 기준, <b>좌표계</b>는 바라보는 기준입니다. 8 m/s와 8 rad를 더하면 안 되고, 월드 좌표의 점은 차량 좌표로 바꾼 뒤 좌우 오차로 써야 합니다.</>,remember:'연결 전에 무엇인지, 단위가 무엇인지, 어느 좌표계인지 확인합니다.',cards:[{title:'TYPE',body:'num · pose · trajectory'},{title:'UNIT',body:'m · m/s · rad'},{title:'FRAME',body:'world · car'}]},
  {n:'03',eyebrow:'FEEDBACK',h:'현재 상태를 다시 읽어야 목표를 유지합니다',p:<>고정 throttle은 속도가 너무 빨라도 줄지 않습니다. 목표와 현재의 차이인 <b>오차(error)</b>를 계속 읽어 행동을 수정하는 구조가 feedback입니다. PID는 이 오차를 줄이는 대표적인 제어기입니다.</>,remember:'목표 - 현재 = 오차, 오차가 줄도록 다음 행동을 바꿉니다.',flow:['목표 8 m/s','오차','PID','차량','현재 Speed ↩']},
  {n:'04',eyebrow:'AUTONOMY LAYERS',h:'경로, 계획, 제어는 서로 다른 질문입니다',p:<>경로 추종은 “어디를 따라갈까”, 로컬 계획은 “장애물 사이에서 어느 미래를 택할까”, 제어는 “그 미래를 위해 지금 얼마나 돌리고 가속할까”를 결정합니다.</>,remember:'Path는 공간, Trajectory는 시간 있는 미래, Command는 지금 실행할 행동입니다.',cards:[{title:'PATH',body:'어디를 지날 것인가'},{title:'PLANNING',body:'어떤 미래가 안전한가'},{title:'CONTROL',body:'지금 무엇을 실행할까'}]},
  {n:'05',eyebrow:'THREE STRATEGIES',h:'Rule, MPC, RL은 판단 방식이 다릅니다',p:<>세 방식 모두 같은 관찰과 Command 경계를 사용할 수 있습니다. Rule은 조건을 직접 쓰고, MPC는 여러 미래를 모델로 비교하고, RL은 경험으로 얻은 policy가 관찰을 행동으로 바꿉니다.</>,remember:'알고리즘이 달라도 입력·출력 계약이 같으면 서로 비교하고 교체할 수 있습니다.',cards:[{title:'RULE',body:'조건이 참이면 회피'},{title:'MPC',body:'후보 미래 중 최소 비용'},{title:'RL',body:'관찰을 policy 행동으로'}]},
  {n:'06',eyebrow:'BLOCK DEPTH',h:'큰 블록도 열어보면 작은 계산입니다',p:<>APEX의 L0 primitive는 더 쪼개기 어려운 계산입니다. L1 composite는 primitive를 의미 단위로 묶었지만 더블클릭으로 열고 fork할 수 있습니다. 완성 알고리즘은 사용자가 이들을 연결한 그래프입니다.</>,remember:'이해할 수 없는 통짜 알고리즘 대신, 열리고 수정되는 합성을 사용합니다.',flow:['L0 primitive','L1 open composite','내 알고리즘 graph']},
  {n:'07',eyebrow:'DEBUGGING',h:'실패는 결과가 아니라 신호에서 찾습니다',p:<>차가 이탈했다면 마지막 조향만 보지 말고 앞의 횡오차, 목표점, 비용, constraint를 역추적합니다. 출력의 파형 버튼이나 연결선 더블클릭으로 <b>VISUALIZE</b>에 신호를 추가하세요.</>,remember:'이상 행동 → actuator → 판단 → 관찰 순서로 거꾸로 추적합니다.',flow:['트랙 이탈','STEER 포화','오차 급증','목표점 확인']},
  {n:'08',eyebrow:'EXPERIMENT',h:'한 번의 좋은 랩은 증명이 아닙니다',p:<>같은 seed와 scenario에서 한 파라미터만 바꿔 A/B로 비교해야 원인을 알 수 있습니다. 이후에는 다른 마찰, 장애물, 상대 속도에서도 반복해 robust한지 확인합니다.</>,remember:'같은 조건, 한 번에 한 변화, 여러 scenario로 검증합니다.',cards:[{title:'A',body:'gain 1.2 · 34.8s'},{title:'B',body:'gain 1.5 · 33.9s'},{title:'CHECK',body:'충돌·이탈도 함께 비교'}]},
  {n:'09',eyebrow:'FIRST BUILD',h:'이제 가장 작은 닫힌 흐름을 만드세요',p:<>Parts Bay에서 Const와 THROTTLE을 장착하고, Const의 출력 `v`를 THROTTLE 입력 `x`에 연결하세요. 실행 준비 신호가 켜지면 주행을 시작합니다. 이후 미션에서 센서와 feedback을 하나씩 추가합니다.</>,remember:'작게 연결하고, 실행하고, 관찰한 뒤 한 단계씩 확장합니다.',flow:['Const','v → x','THROTTLE','주행 시작']},
]

export function Tutorial() {
  const close=useTut(s=>s.close),goLevel=useGame(s=>s.goLevel)
  const [i,setI]=useState(0),step=STEPS[i],last=i===STEPS.length-1
  const start=()=>{close();goLevel('tut')}
  return <div className="tut-overlay" onClick={close}>
    <div className="tut concept-course" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" onClick={e=>e.stopPropagation()}>
      <button className="tut-close" aria-label="도움말 닫기" onClick={close}>×</button>
      <aside className="tut-rail">
        <span>APEX STARTER</span><b>기본 개념</b>
        <div className="tut-progress" aria-label={`${i+1}/${STEPS.length}`}>{STEPS.map((s,k)=><button key={s.n} className={k===i?'on':k<i?'done':''} onClick={()=>setI(k)} aria-label={`${k+1}단계`}>{k<i?'✓':s.n}</button>)}</div>
      </aside>
      <section className="tut-content">
        <div className="step-n">{step.eyebrow} · {step.n}</div>
        <h3 id="tutorial-title">{step.h}</h3>
        <p>{step.p}</p>
        {step.flow&&<div className="concept-flow">{step.flow.map((v,k)=><React.Fragment key={v}><span>{v}</span>{k<step.flow!.length-1&&<i>→</i>}</React.Fragment>)}</div>}
        {step.cards&&<div className="concept-cards">{step.cards.map(c=><article key={c.title}><b>{c.title}</b><span>{c.body}</span></article>)}</div>}
        <div className="concept-remember"><small>기억할 한 문장</small><b>{step.remember}</b></div>
        <div className="tut-nav">
          <span>{String(i+1).padStart(2,'0')} / {String(STEPS.length).padStart(2,'0')}</span>
          {i>0&&<button onClick={()=>setI(i-1)}>이전</button>}
          {!last?<button className="primary" onClick={()=>setI(i+1)}>다음 개념</button>:<button className="primary" onClick={start}>첫 시동 직접 해보기</button>}
        </div>
      </section>
    </div>
  </div>
}
