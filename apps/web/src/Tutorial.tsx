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
  {n:'03',eyebrow:'CONTROL GOAL',h:'제어는 원하는 상태를 계속 유지하는 일입니다',p:<>제어기는 차량을 직접 순간이동시키지 않습니다. 원하는 속도나 방향인 <b>목표값(setpoint)</b>을 정하고, throttle과 steer를 조절해 실제 상태가 목표를 따라가게 만듭니다.</>,remember:'제어는 목표값을 정하고 실제 상태가 그 목표를 따라가게 만드는 과정입니다.',cards:[{title:'TARGET',body:'원하는 속도 8 m/s'},{title:'STATE',body:'현재 속도 5 m/s'},{title:'ACTION',body:'throttle을 높임'}]},
  {n:'04',eyebrow:'ACTUATOR',h:'STEER와 THROTTLE은 결과가 아니라 입력입니다',p:<>STEER는 앞바퀴 방향, THROTTLE은 가속·제동 요청입니다. 둘 다 −1부터 1 사이의 정규화된 command이며, 같은 값도 속도·노면·차량 상태에 따라 다른 움직임을 만듭니다.</>,remember:'Command는 차량에 요청하는 입력이고, 실제 움직임은 동역학이 결정합니다.',cards:[{title:'STEER',body:'−1 좌 · 0 직진 · +1 우'},{title:'THROTTLE',body:'−1 제동 · 0 유지 · +1 가속'},{title:'DYNAMICS',body:'속도·마찰에 따라 반응'}]},
  {n:'05',eyebrow:'OPEN · CLOSED LOOP',h:'현재 상태를 읽지 않으면 변화에 대응할 수 없습니다',p:<>Const를 THROTTLE에 바로 연결하면 언제나 같은 명령을 내는 <b>open loop</b>입니다. Speed를 다시 읽어 throttle을 바꾸면 결과가 입력으로 돌아오는 <b>closed loop</b>, 즉 feedback 제어가 됩니다.</>,remember:'Open loop는 명령만 보내고, closed loop는 결과를 읽어 다음 명령을 고칩니다.',flow:['목표값','Controller','차량','현재 상태 ↩']},
  {n:'06',eyebrow:'ERROR',h:'목표와 현재의 차이가 제어 방향을 알려줍니다',p:<><b>error = target − current</b>입니다. 목표 8 m/s, 현재 5 m/s라면 error는 +3이라 가속해야 합니다. 현재가 10 m/s라면 −2이므로 throttle을 줄이거나 제동해야 합니다. 빼기 순서를 바꾸면 제어 방향도 반대가 됩니다.</>,remember:'오차의 크기는 얼마나, 부호는 어느 방향으로 고칠지 알려줍니다.',flow:['Target 8','− Current 5','= Error +3','가속']},
  {n:'07',eyebrow:'PID',h:'P·I·D는 서로 다른 방식으로 오차를 봅니다',p:<><b>P</b>는 지금 오차에 즉시 반응하고, <b>I</b>는 오래 남은 작은 오차를 누적해 없애며, <b>D</b>는 오차가 얼마나 빠르게 변하는지 보고 급격한 움직임을 누릅니다. 항상 세 항을 크게 쓰는 것이 좋은 것은 아닙니다.</>,remember:'P는 현재, I는 누적, D는 변화 속도를 보고 행동을 합칩니다.',cards:[{title:'P · NOW',body:'반응을 빠르게'},{title:'I · HISTORY',body:'남는 오차를 제거'},{title:'D · TREND',body:'급격한 변화를 억제'}]},
  {n:'08',eyebrow:'TUNING · LIMITS',h:'큰 gain은 빠르지만 안정적이라는 뜻은 아닙니다',p:<>gain이 너무 작으면 늦고, 너무 크면 목표를 지나쳐 진동합니다. 출력은 clamp로 −1~1에 제한하고, VISUALIZE에서 error와 command를 함께 보세요. 먼저 P만 조절하고 필요할 때 I, D를 조금씩 더하는 것이 안전합니다.</>,remember:'빠른 반응보다 오버슈트·진동·포화 없이 목표에 수렴하는지가 중요합니다.',flow:['P부터 조절','오버슈트 관찰','필요시 I·D','clamp 확인']},
  {n:'09',eyebrow:'AUTONOMY LAYERS',h:'경로, 계획, 제어는 서로 다른 질문입니다',p:<>경로 추종은 “어디를 따라갈까”, 로컬 계획은 “장애물 사이에서 어느 미래를 택할까”, 제어는 “그 미래를 위해 지금 얼마나 돌리고 가속할까”를 결정합니다.</>,remember:'Path는 공간, Trajectory는 시간 있는 미래, Command는 지금 실행할 행동입니다.',cards:[{title:'PATH',body:'어디를 지날 것인가'},{title:'PLANNING',body:'어떤 미래가 안전한가'},{title:'CONTROL',body:'지금 무엇을 실행할까'}]},
  {n:'10',eyebrow:'THREE STRATEGIES',h:'Rule, MPC, RL은 판단 방식이 다릅니다',p:<>세 방식 모두 앞에서 배운 state·target·command와 feedback 경계를 사용합니다. Rule은 조건을 직접 쓰고, MPC는 여러 미래를 모델로 비교하고, RL은 경험으로 얻은 policy가 관찰을 행동으로 바꿉니다.</>,remember:'Rule/MPC/RL보다 먼저, 무엇을 관찰하고 무엇을 제어하는지 정의해야 합니다.',cards:[{title:'RULE',body:'조건이 참이면 회피'},{title:'MPC',body:'후보 미래 중 최소 비용'},{title:'RL',body:'관찰을 policy 행동으로'}]},
  {n:'11',eyebrow:'BLOCK DEPTH',h:'큰 블록도 열어보면 작은 계산입니다',p:<>APEX의 L0 primitive는 더 쪼개기 어려운 계산입니다. L1 composite는 primitive를 의미 단위로 묶었지만 더블클릭으로 열고 fork할 수 있습니다. 완성 알고리즘은 사용자가 이들을 연결한 그래프입니다.</>,remember:'이해할 수 없는 통짜 알고리즘 대신, 열리고 수정되는 합성을 사용합니다.',flow:['L0 primitive','L1 open composite','내 알고리즘 graph']},
  {n:'12',eyebrow:'DEBUGGING · EXPERIMENT',h:'실패는 신호에서 찾고 같은 조건에서 비교합니다',p:<>차가 이탈했다면 actuator에서 error와 관찰까지 거꾸로 추적합니다. VISUALIZE에 target·state·error·command를 함께 추가하고, 같은 seed에서 파라미터 하나만 바꿔 A/B로 비교하세요.</>,remember:'같은 조건에서 한 번에 하나만 바꾸고, 행동에서 원인 방향으로 역추적합니다.',flow:['이상 행동','Command','Error','State·Target']},
  {n:'13',eyebrow:'FIRST BUILD',h:'먼저 open loop를 직접 만들고 한계를 확인하세요',p:<>Parts Bay에서 Const와 THROTTLE을 장착하고 Const의 `v`를 THROTTLE의 `x`에 연결하세요. 이 첫 미션은 의도적으로 feedback이 없습니다. 실행해 본 뒤 다음 미션에서 Speed와 error, PID를 추가하며 차이를 확인합니다.</>,remember:'작은 open loop에서 시작해 결과를 본 뒤 feedback 제어로 확장합니다.',flow:['Const','v → x','THROTTLE','결과 관찰']},
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
