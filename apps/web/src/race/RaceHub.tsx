import React from 'react'
import { PHYSICS_VERSION } from '@apex/core'
import { useGame } from '../store'
import { fetchLeaderboard, joinMatch, playerId, raceNetwork, type LeaderboardEntry, type RaceMode } from './raceOnline'

const MODES:{mode:RaceMode;level:string;tag:string;title:string;desc:string;rule:string}[]=[
  {mode:'time-trial',level:'rt',tag:'SOLO · VERIFIED RUN',title:'Time Trial',desc:'동일 seed와 차량으로 가장 빠른 클린 랩을 겨룹니다.',rule:'ghost 허용 · 접촉 없음 · 재현 가능한 run 제출'},
  {mode:'head-to-head',level:'rh',tag:'1 VS 1 · LIVE ROOM',title:'Head-to-Head',desc:'한 명의 상대와 동시에 출발해 먼저 결승선을 통과합니다.',rule:'2 cars · 동기화 start · 접촉/페널티'},
  {mode:'grid-start',level:'rg',tag:'6 CARS · LIVE ROOM',title:'Grid Start',desc:'여섯 대가 그리드에서 함께 출발하는 본경기입니다.',rule:'qualifying grid · 6 cars · position points'},
]
const AI=[{player:'AI · Reference',time:21.0833,algorithm:'Pure Pursuit'},{player:'AI · Safe',time:24.5,algorithm:'Conservative'}]

export function RaceHub(){
  const {goMap,goLevel,best}=useGame()
  const [mode,setMode]=React.useState<RaceMode>('time-trial')
  const [online,setOnline]=React.useState<LeaderboardEntry[]>([])
  const socketClose=React.useRef<null|(()=>void)>(null)
  const [status,setStatus]=React.useState(raceNetwork.configured?'ONLINE SERVICE READY':'LOCAL PRACTICE · SERVER NOT CONFIGURED')
  React.useEffect(()=>{let live=true;fetchLeaderboard(mode).then(v=>{if(live)setOnline(v)}).catch(()=>{if(live)setStatus('ONLINE SERVICE UNREACHABLE')});return()=>{live=false}},[mode])
  const local=best.rt
  const findMatch=(raceMode:RaceMode)=>{if(raceMode==='time-trial'){setMode(raceMode);return}try{socketClose.current?.();setStatus('MATCHMAKING · SEARCHING');socketClose.current=joinMatch({version:1,physicsVersion:PHYSICS_VERSION,mode:raceMode,playerId:playerId(),designHash:'pursuit-v1',region:'auto'},message=>{const value=message as any;setStatus(value?.type==='match.found'?'MATCH FOUND · ROOM READY':'MATCHMAKING · CONNECTED')})}catch{setStatus('ONLINE SERVICE UNAVAILABLE')}}
  React.useEffect(()=>()=>socketClose.current?.(),[])
  return <main className="race-hub">
    <header className="race-hero"><button className="back" onClick={goMap}>← 메인</button><span className="eyebrow">COMPETITIVE AUTONOMOUS RACING</span><h1>RACE <em>CONTROL</em></h1><p>알고리즘을 만드는 것에서 끝나지 않습니다. 동일한 규칙에서 기록과 위치로 증명하세요.</p><div className={'network-state '+(raceNetwork.configured?'on':'off')}><i/>{status}</div></header>
    <section className="race-modes" aria-label="경주 종류">{MODES.map(item=><article key={item.mode} className={mode===item.mode?'selected':''} onClick={()=>setMode(item.mode)}><span>{item.tag}</span><h2>{item.title}</h2><p>{item.desc}</p><small>{item.rule}</small><div><button onClick={e=>{e.stopPropagation();goLevel(item.level)}}>AI 연습 출전 →</button><button disabled={!raceNetwork.configured} onClick={e=>{e.stopPropagation();findMatch(item.mode)}} title={raceNetwork.configured?(item.mode==='time-trial'?'글로벌 기록판 보기':'온라인 매치 찾기'):'race server 환경변수가 필요합니다'}>{raceNetwork.configured?(item.mode==='time-trial'?'GLOBAL BOARD':'매치 찾기'):'ONLINE 준비 중'}</button></div></article>)}</section>
    <section className="leaderboard"><div className="leader-head"><div><span className="eyebrow">{mode.toUpperCase()}</span><h2>{online.length?'GLOBAL LEADERBOARD':'LOCAL BENCHMARK'}</h2></div><b>{online.length?`${online.length} VERIFIED RUNS`:'AI와 내 기록을 먼저 비교하세요'}</b></div>
      <div className="leader-table"><div className="leader-row head"><span>POS</span><span>DRIVER</span><span>ALGORITHM</span><span>TIME</span></div>
        {(online.length?online:[...(local!=null?[{rank:1,player:'YOU · Local',time:local,verified:true,algorithm:'My graph'}]:[]),...AI.map((r,i)=>({rank:i+1+(local!=null?1:0),verified:true,...r}))]).sort((a,b)=>a.time-b.time).map((row,i)=><div className={'leader-row '+(row.player.startsWith('YOU')?'you':'')} key={row.player+i}><span>#{i+1}</span><span>{row.player}{row.verified&&<i>VERIFIED</i>}</span><span>{row.algorithm}</span><strong>{row.time.toFixed(4)}s</strong></div>)}
      </div>
      {!raceNetwork.configured&&<p className="online-note"><b>온라인 연결 경계 준비됨.</b> `VITE_RACE_API_URL`과 `VITE_RACE_WS_URL`을 배포 환경에 설정하면 global leaderboard 조회와 실시간 room queue가 활성화됩니다. 서버가 없을 때 다른 유저 기록을 가짜로 표시하지 않습니다.</p>}
    </section>
  </main>
}
