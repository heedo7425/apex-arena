import React, { useEffect, useMemo, useRef, useState } from 'react'
import { NT, validateGraph } from '@apex/core'
import type { Graph, GraphIssue } from '@apex/core'
import { Editor } from '../editor/Editor'
import { coreToRF } from '../editor/compile'
import { metaOf } from '../editor/nodeMeta'
import { Viewport } from '../sim/Viewport'
import { useDesignLibrary, useGame, useLive, useTut, useVisualization } from '../store'
import { levelById, LEVELS } from './levels'
import { missionVenue } from './worlds'

type MissionBrief = {
  situation:string; question:string; hints:[string,string,string]
  takeaway:string
}
const BRIEFS: Record<string,MissionBrief> = {
  tut:{
    situation:'차량은 준비됐지만 제어 신호가 없어 모터가 움직이지 않습니다.',
    question:'숫자 하나를 차량의 가속 행동으로 전달하려면 무엇이 필요할까요?',
    hints:['값을 만드는 파트와 행동으로 보내는 파트가 필요합니다.','Const는 고정 신호를 만들고 THROTTLE은 가속 명령으로 사용합니다.','Const.v를 THROTTLE.x에 연결한 뒤 실행해 보세요.'],
    takeaway:'숫자 → 연결 → 액추에이터의 흐름이 실제 차량 행동을 만들었습니다.',
  },
  l1:{
    situation:'고정 스로틀은 목표 속도를 지나쳐도 스스로 줄일 수 없습니다.',
    question:'목표 속도와 현재 속도의 차이를 계속 확인하려면 어떤 흐름이 필요할까요?',
    hints:['닫힌 고리 제어는 목표값과 측정값을 비교해 오차를 줄입니다.','Speed, Const, Sub, PID, Clamp, THROTTLE이 측정부터 행동까지 담당합니다.','Const−Speed → PID → Clamp → THROTTLE로 연결하고 Const를 8 m/s로 설정하세요.'],
    takeaway:'피드백은 현재 상태를 다시 읽어 오차를 줄이므로 목표 속도를 유지합니다.',
  },
  l2:{
    situation:'속도 제어기는 이미 장착돼 차를 굴리고 있지만, 차량은 코너가 어디인지 몰라 직진합니다.',
    question:'앞쪽 목표점의 좌우 오차를 어떻게 회전 곡률과 조향으로 바꿀까요?',
    hints:['앞쪽 목표점을 차량 좌표계로 옮기면 좌우 오차 y가 나옵니다. Pure Pursuit의 조향은 이 y에서 나와요.','Pure Pursuit 곡률 법칙: k = 2·y / Ld². vec.xy로 y를 꺼내고 ÷로 나눕니다. steer = clamp(k × gain).','Lookahead → To car frame → vec.xy(y)·vec.len(Ld) → (2×y) ÷ (Ld×Ld) = k → ×gain(≈5) → clamp → STEER. Ld는 6으로.'],
    takeaway:'Pure Pursuit의 곡률 법칙 k=2y/Ld²을 직접 노드로 짜서 목표점을 조향으로 바꿨습니다.',
  },
  l3:{
    situation:'조향·속도 블록은 제공됐지만, 속도 블록의 target이 비어 있어 차가 아직 못 나갑니다. 직선·헤어핀을 같은 속도로 달리면 그립 한계를 넘습니다.',
    question:'코너의 급함을 속도 블록의 목표속도에 어떻게 반영할까요?',
    hints:['곡률이 클수록 회전 반경이 작아 안전 속도는 낮아져야 합니다.','Curvature ahead가 곡률을 읽고 Grip speed가 안전 목표 속도를 만듭니다.','Pose·Track → Curvature ahead.k → Grip speed.v → ▣ Speed PID의 target으로 연결하세요.'],
    takeaway:'속도 계획기는 곡률을 미리 읽어 속도 목표를 바꾸므로 코너 전에 감속합니다.',
  },
  l4:{
    situation:'좁은 통로의 단일 먼 빔은 노이즈일 수 있습니다. 차가 들어갈 만큼 연속된 빈 공간을 찾아야 합니다.',
    question:'노이즈를 제거한 뒤 가장 넓은 안전 간격의 중심을 어떻게 조향각으로 바꿀까요?',
    hints:['전처리로 비정상 거리를 정리한 뒤, 임계 거리보다 먼 빔이 가장 길게 이어진 구간을 찾습니다.','Widest gap의 중심 인덱스를 da와 곱하고 a0를 더하면 센서 기준 조향각이 됩니다.','scan.ranges → preprocess → widest gap → × scan.da → + scan.a0 → clamp → STEER.'],
    takeaway:'Follow-the-Gap은 한 개의 먼 빔이 아니라 차량이 통과할 수 있는 연속된 안전 공간의 중심을 선택합니다.',
  },
  l5:{
    situation:'센터라인 위에 고정 장애물이 놓였습니다. 평소 조향은 유지하되 가까워질 때만 회피해야 합니다.',
    question:'장애물이 멀리 있을 때의 안정성과 가까울 때의 회피를 어떻게 한 회로에 담을까요?',
    hints:['Scene objects에서 가장 가까운 객체와 거리를 구하세요.','거리 비교 결과로 0과 회피 오프셋 중 하나를 선택하면 필요할 때만 개입합니다.','Pursuit 조향 + select(distance<12, 회피값, 0) → clamp → STEER.'],
    takeaway:'로컬 회피는 기본 경로 추종을 버리지 않고 위험 구간에서만 조향을 수정합니다.',
  },
  l6:{
    situation:'앞에 느린 차량이 주행 중입니다. 충돌하지 않으면서 추월 의도를 명시하고 옆 공간을 사용해야 합니다.',
    question:'대상 차량·추월 방향·개입 조건을 분리하면 왜 더 안전하게 수정할 수 있을까요?',
    hints:['가장 가까운 차량을 Pass left intent의 target으로 지정하세요.','Intent parts의 offset은 추월 방향을 제어 신호로 꺼내는 경계입니다.','접근 거리 조건으로 추월 offset을 선택해 Pursuit 조향과 합성하세요.'],
    takeaway:'행동 의도와 저수준 조향을 분리하면 추월 방향을 바꿔도 전체 제어기를 다시 만들 필요가 없습니다.',
  },
}

function activeNodeIds(graph: Graph): Set<string> {
  const active = new Set<string>()
  const visit = (id:string) => {
    if (active.has(id) || !graph.nodes[id]) return
    active.add(id)
    for (const ref of Object.values(graph.nodes[id].in ?? {})) if (ref[0] === 'n') visit(ref[1] as string)
  }
  graph.order.filter(id => graph.nodes[id].type.startsWith('sink.')).forEach(visit)
  return active
}
function requirementMet(graph:Graph, active:Set<string>, req:(typeof LEVELS)[number]['requirements'][number]):boolean {
  if(req.kind==='node') return [...active].some(id=>graph.nodes[id].type===req.type)
  return [...active].some(toId=>{
    const to=graph.nodes[toId]
    if(to.type!==req.to) return false
    const ref=to.in?.[req.toPort]
    return !!ref&&ref[0]==='n'&&active.has(ref[1] as string)&&graph.nodes[ref[1] as string]?.type===req.from&&ref[2]===req.fromPort
  })
}
function throttleWired(graph: Graph): boolean {
  const sinkId = graph.order.find(n => graph.nodes[n].type === 'sink.throttle')
  return !!(sinkId && graph.nodes[sinkId].in?.x)
}

function issueLabel(issue: GraphIssue, graph:Graph): string {
  const nodeType=issue.nodeId?graph.nodes[issue.nodeId]?.type:undefined
  const label=nodeType?metaOf(nodeType).label:'출력'
  if (issue.code === 'missing-output') return issue.message.includes('steer')?'STEER 출력 블록을 장착하세요.':'THROTTLE 출력 블록을 장착하세요.'
  if (issue.code === 'unwired-output') return `${label}의 x 입력을 연결하세요.`
  if (issue.code === 'unwired-input') return `${label}의 ${issue.port} 입력이 비어 있어요.`
  if (issue.code === 'type-mismatch') return '서로 다른 데이터 타입의 포트가 연결되어 있어요.'
  if (issue.code === 'cycle') return 'Delay 없이 되돌아오는 연결이 있어요.'
  return issue.message
}

export function LevelScreen({ id }: { id: string }) {
  const level = levelById(id)
  const venue = useMemo(() => missionVenue(id), [id])
  const world = venue.world
  const [editorGraph,setEditorGraph]=useState<Graph>(level.starter)
  const [editorRevision,setEditorRevision]=useState(0)
  const initial = useMemo(() => coreToRF(editorGraph), [editorGraph])
  const [graph, setGraph] = useState<Graph>(level.starter)
  const [hud, setHud] = useState({ speed:0, best:null as number | null, hold:0 })
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [tutMoved, setTutMoved] = useState(false)
  const [pane, setPane] = useState<'graph'|'sim'>('graph')
  const [split, setSplit] = useState(60)
  const [simKey, setSimKey] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (result) resultRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' }) }, [result])
  const resizing = useRef(false)
  const setVals = useLive((s) => s.setVals)
  const { complete, goMap, best } = useGame()
  const allDesigns=useDesignLibrary(s=>s.designs)
  const designs=useMemo(()=>allDesigns.filter(d=>d.levelId===id),[allDesigns,id])
  const saveDesign=useDesignLibrary(s=>s.saveDesign)
  const [designName,setDesignName]=useState('My setup')
  const [designNotice,setDesignNotice]=useState('')
  const nextLevel = LEVELS.find(l => l.n === level.n + 1)
  const isTut = level.id === 'tut'
  const isL1 = level.id === 'l1'
  const isL2 = level.id === 'l2'
  const isL3 = level.id === 'l3'
  const requiredOutputs = useMemo(() => isTut || isL1 ? ['sink.throttle']
    : undefined, [isTut, isL1])
  const issues = useMemo(() => validateGraph(graph, NT, {
    requireOutputs:!requiredOutputs, requiredOutputs,
  }), [graph, requiredOutputs])
  const activeIds = useMemo(() => activeNodeIds(graph), [graph])
  const checks = level.requirements.map(req => ({ ...req, ok:requirementMet(graph,activeIds,req) }))
  const requirementsMet = checks.every(c => c.ok)
  const outputReady = isTut || isL1 ? throttleWired(graph) : issues.length === 0
  const canRun = issues.length === 0 && requirementsMet && outputReady
  const brief = BRIEFS[level.id]
  const editorPalette = level.palette
  const simGraph = graph
  const wiringIssue = issueLabel(issues[0] ?? { code:'unwired-input', message:'필수 노드를 출력 경로에 연결하세요.' },graph)
  const waitingMessage = `회로 대기 · ${wiringIssue}`

  useEffect(() => {
    setGraph(level.starter);setEditorGraph(level.starter);setEditorRevision(r=>r+1);setHintLevel(0);setTutMoved(false);setPane('graph');setResult(null);useVisualization.getState().clearAll()
  }, [id, level.starter])

  const finishTut = () => { complete('tut', 60); useGame.getState().goLevel('l1') }
  const handleGraph = (next:Graph) => { setGraph(next); setResult(null); useVisualization.getState().clearSamples() }
  const retry = () => { setResult(null); useVisualization.getState().clearSamples(); setSimKey(k => k + 1) }

  const saveCurrentDesign=()=>{
    const saved=saveDesign(id,designName.trim()||'My setup',graph)
    setDesignNotice(`${saved.name} v${saved.version} 저장됨`)
  }
  const restoreDesign=(designId:string)=>{
    const saved=designs.find(d=>d.id===designId);if(!saved)return
    setGraph(saved.graph);setEditorGraph(saved.graph);setEditorRevision(r=>r+1)
    setDesignNotice(`${saved.name} v${saved.version} 복원됨`)
  }
  const onSpeedTrial = (t:number) => {
    if (!isL1) return
    complete(level.id, t)
    setResult({ ok:true, msg:'8 m/s 고정 성공 · ' + t.toFixed(2) + 's' })
  }

  const onLap = (t: number, dirty: boolean) => {
    if (isTut) return
    if (dirty) { setResult({ ok:false, msg:`트랙 이탈 · ${t.toFixed(2)}s` }); return }
    if (level.objective.type === 'time' && t > level.objective.target) {
      setResult({ ok:false, msg:`클린 랩 ${t.toFixed(2)}s · 목표까지 ${(t-level.objective.target).toFixed(2)}s` }); return
    }
    complete(level.id, t)
    setResult({ ok:true, msg:`클리어 · ${t.toFixed(2)}s` })
  }

  const resize = (e:React.PointerEvent) => {
    if (!resizing.current || !bodyRef.current) return
    const box = bodyRef.current.getBoundingClientRect()
    setSplit(Math.max(38, Math.min(72, ((e.clientX-box.left)/box.width)*100)))
  }

  return (
    <div className="level">
      <div className="lv-top">
        <button className="back" onClick={goMap}>← 캠페인</button>
        <div className="lv-title-wrap">
          <span className="eyebrow">{level.kicker}</span>
          <div className="lv-title"><b>0{level.n}</b> {level.title}</div>
        </div>
        <div className="lv-best mono">BEST {best[level.id] != null ? best[level.id].toFixed(2) + 's' : '—'}</div>
        <button className="help-btn" aria-label="도움말 열기" title="도움말" onClick={() => useTut.getState().show()}>?</button>
      </div>

      <div className="mission-bar">
        <div className="mission-copy"><span className="eyebrow">MISSION</span><p>{level.teach}</p></div>
        <div className="mission-checks">
          {isL1 && <span className="done">✓ STRAIGHT PROVING GROUND</span>}
          {isL2 && <span className="done">✓ ▣ Speed PID 블록 제공됨</span>}
          {isL3 && <span className="done">✓ ▣ 조향·속도 블록 제공됨</span>}
          {checks.map((c,i) => <span key={c.label+i} className={c.ok ? 'done' : ''}>{c.ok ? '✓' : '○'} {c.label}</span>)}
          <span className={outputReady ? 'done' : ''}>{outputReady ? '✓' : '○'} 출력 연결</span>
        </div>
        <div className={'run-state ' + (canRun ? 'ready' : 'waiting')}>
          <i />{canRun ? '실행 준비됨' : waitingMessage}
        </div>
        <div className="design-tools">
          <input value={designName} onChange={e=>setDesignName(e.target.value)} aria-label="설계 이름"/>
          <button onClick={saveCurrentDesign}>설계 버전 저장</button>
          <select defaultValue="" onChange={e=>{restoreDesign(e.target.value);e.currentTarget.value=''}}><option value="" disabled>저장 설계 복원</option>{designs.slice().reverse().map(d=><option key={d.id} value={d.id}>{d.name} · v{d.version}</option>)}</select>
          {designNotice&&<span>{designNotice}</span>}
        </div>
      </div>

      <div className="mobile-tabs" role="tablist" aria-label="작업 화면">
        <button className={pane === 'graph' ? 'on' : ''} onClick={() => setPane('graph')}>그래프</button>
        <button className={pane === 'sim' ? 'on' : ''} onClick={() => setPane('sim')}>시뮬레이션 {canRun ? '✓' : ''}</button>
      </div>

      <div ref={bodyRef} className="lv-body" style={{ ['--split' as any]:split+'%' }}
        onPointerMove={resize} onPointerUp={() => { resizing.current=false }} onPointerCancel={() => { resizing.current=false }}>
        <div className={'lv-pane editor-pane' + (pane !== 'graph' ? ' mobile-hidden' : '')}>
          <Editor key={`${id}-${editorRevision}`} initial={initial} palette={editorPalette} onGraph={handleGraph}
            nodeDefaults={isL1 ? { const:{value:8} } : undefined} requiredOutputs={requiredOutputs} />
        </div>
        <button className="split-handle" aria-label="그래프와 시뮬레이션 영역 너비 조절"
          onPointerDown={(e) => { resizing.current=true; e.currentTarget.setPointerCapture(e.pointerId) }}
          onKeyDown={(e) => { if(e.key==='ArrowLeft') setSplit(v=>Math.max(38,v-2)); if(e.key==='ArrowRight') setSplit(v=>Math.min(72,v+2)) }}>
          <span />
        </button>
        <div className={'lv-pane lv-right' + (pane !== 'sim' ? ' mobile-hidden' : '')}>
          <div className="circuit-head"><div><span>{venue.name}</span><b>{venue.layout}</b></div><em><i /> TELEMETRY ONLINE</em></div>
          <Viewport key={simKey} world={world} graph={simGraph} canRun={canRun}
            trial={level.objective.type === 'speed' ? level.objective : undefined} onTrial={onSpeedTrial}
            onValues={(vals, info) => {
              setVals(vals); setHud({ speed:info.speed, best:info.best, hold:info.hold })
              useVisualization.getState().sample(info.simTime,vals)
              if (isTut && info.speed > 2) setTutMoved(true)
            }}
            onLap={onLap} />
          <div className="coach inquiry">
            <div className="coach-n"><span>ENGINEERING BRIEF</span><b>{hintLevel}/3 HINTS</b></div>
            <p className="brief-situation">{brief.situation}</p>
            <div className="brief-question"><small>THINK</small>{brief.question}</div>
            {hintLevel>0&&<div className="hint-stack">
              {brief.hints.slice(0,hintLevel).map((hint,i)=><p key={hint}><b>HINT {i+1}</b>{hint}</p>)}
            </div>}
            <div className="brief-actions">
              <button className="hint-btn" disabled={hintLevel===3} onClick={()=>setHintLevel(n=>Math.min(3,n+1))}>
                {hintLevel===3?'모든 힌트 공개됨':hintLevel===0?'힌트 보기':'다음 힌트'}
              </button>
              {isTut&&tutMoved&&<button className="coach-go" onClick={finishTut}>원리 확인 · 레벨 1로 →</button>}
            </div>
            {isTut&&tutMoved&&<p className="takeaway">WHY IT WORKED · {brief.takeaway}</p>}
          </div>
          <div className="lv-hud mono">
            <span><small>SPEED</small><b>{Math.round(hud.speed*3.6)}</b> km/h</span>
            <span><small>OBJECTIVE</small><b>{isTut ? 'CREATE MOTION' : level.objective.type === 'time' ? 'CLEAN ≤ ' + level.objective.target + 's' : level.objective.type === 'speed' ? Math.round(level.objective.target*3.6) + ' km/h · ' + level.objective.hold + 's' : 'CLEAN LAP'}</b></span>
            <span><small>{isTut ? 'OBSERVATION' : isL1 ? 'TARGET HOLD' : 'SESSION BEST'}</small><b>{isTut ? (tutMoved ? 'MOTION DETECTED' : 'NO MOTION') : isL1 ? Math.min(hud.hold, level.objective.type === 'speed' ? level.objective.hold : 0).toFixed(1) + ' / 2.0s' : hud.best != null ? hud.best.toFixed(2)+'s' : '—'}</b></span>
          </div>
          {result && <div ref={resultRef} className={'lv-result ' + (result.ok ? 'ok' : 'bad')}>
            <span><small>{result.ok ? 'MISSION COMPLETE' : 'TRY AGAIN'}</small>{result.msg}{result.ok&&<em>{brief.takeaway}</em>}</span>
            {!result.ok && <button onClick={retry}>↻ 다시 시작</button>}
            {result.ok && nextLevel && <button onClick={() => useGame.getState().goLevel(nextLevel.id)}>다음 레벨 →</button>}
            {result.ok && !nextLevel && <button onClick={goMap}>캠페인으로</button>}
          </div>}
        </div>
      </div>
    </div>
  )
}
