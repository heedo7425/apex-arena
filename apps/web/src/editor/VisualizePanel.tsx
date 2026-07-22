import React from 'react'
import { useVisualization, type VisualizationPoint } from '../store'

const W=300,H=76,P=8
function fmt(value:number){
  if(Math.abs(value)>=1000)return value.toFixed(0)
  if(Math.abs(value)>=10)return value.toFixed(2)
  return value.toFixed(3)
}
function linePath(points:VisualizationPoint[]){
  if(!points.length)return ''
  const values=points.map(p=>p.value), lo=Math.min(...values), hi=Math.max(...values)
  const range=Math.max(hi-lo,1e-9), t0=points[0].t, dt=Math.max(points[points.length-1].t-t0,1e-9)
  return points.map((point,index)=>{
    const x=P+(point.t-t0)/dt*(W-P*2)
    const y=H-P-(point.value-lo)/range*(H-P*2)
    return `${index?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

export function VisualizePanel(){
  const {signals,samples,latest,runs,open,removeSignal,clearSamples,saveRun,toggle}=useVisualization()
  if(!open)return null
  return <aside className="visualize-panel" aria-label="VISUALIZE 신호 그래프">
    <header className="vz-head">
      <div><small>EXPERIMENT TELEMETRY</small><b>VISUALIZE</b></div>
      <span>{signals.length} SIGNALS</span>
      <button onClick={clearSamples} disabled={!signals.length}>기록 지우기</button>
      <button onClick={()=>saveRun('A')} disabled={!signals.length}>A 저장</button>
      <button onClick={()=>saveRun('B')} disabled={!signals.length}>B 저장</button>
      <button className="vz-close" onClick={toggle} aria-label="VISUALIZE 닫기">×</button>
    </header>
    {!signals.length&&<div className="vz-empty">
      <b>비교할 신호를 선택하세요.</b>
      <p>블록의 출력 옆 파형 버튼을 누르거나 연결선을 더블클릭하면 여기에 실시간 변화가 그려집니다.</p>
    </div>}
    {(runs.A||runs.B)&&<div className="vz-ab">
      <b>A/B EXPERIMENT</b>
      {runs.A&&runs.B?(()=>{
        const common=Object.keys(runs.A!.stats).filter(k=>k in runs.B!.stats)
        if(!common.length)return <p>A·B에 공통 numeric 신호가 없어요.</p>
        return <table className="vz-ab-table"><thead><tr><th>신호</th><th>A</th><th>B</th><th>Δ(B−A)</th></tr></thead><tbody>
          {common.map(k=>{const a=runs.A!.stats[k].mean,b=runs.B!.stats[k].mean,label=signals.find(s=>s.id===k)?.label??k
            return <tr key={k}><td>{label}</td><td>{fmt(a)}</td><td>{fmt(b)}</td><td className={b-a>0?'up':b-a<0?'down':''}>{(b-a>=0?'+':'')+fmt(b-a)}</td></tr>})}
        </tbody></table>
      })():<p>A {runs.A?Object.keys(runs.A.stats).length+' signals':'—'} · B {runs.B?Object.keys(runs.B.stats).length+' signals':'—'} — 두 슬롯 다 저장하면 mean 차이를 비교해요.</p>}
    </div>}
    <div className="vz-signals">{signals.map(signal=>{
      const points=samples[signal.id]||[], values=points.map(p=>p.value)
      const current=values.at(-1), lo=values.length?Math.min(...values):null, hi=values.length?Math.max(...values):null
      return <section className="vz-card" key={signal.id} style={{['--signal' as any]:signal.color}}>
      const spatial=signal.valueType!=='num', raw=latest[signal.id]
      const spatialCount=Array.isArray(raw)?raw.length:raw&&typeof raw==='object'?1:0
        <div className="vz-card-h">
          <i/><span><b>{signal.label}</b><small>{signal.nodeId}.{signal.port}</small></span>
          <strong>{spatial?spatialCount:(current==null?'—':fmt(current))}<em>{spatial?signal.valueType:signal.unit}</em></strong>
          <button onClick={()=>removeSignal(signal.id)} aria-label={`${signal.label} Visualize에서 제거`}>×</button>
        </div>
        {spatial?<div className="vz-empty">
          <b>SIMULATION OVERLAY ACTIVE</b>
          <p>{signal.valueType} 데이터가 트랙 위에 실시간으로 표시됩니다.</p>
        </div>:<>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${signal.label} 시간 그래프`}>
            <path className="vz-grid" d={`M${P},${H/2}H${W-P} M${P},${P}H${W-P} M${P},${H-P}H${W-P}`}/>
            {points.length>1&&<path className="vz-line" d={linePath(points)}/>}
          </svg>
          <div className="vz-stats"><span>MIN <b>{lo==null?'—':fmt(lo)}</b></span><span>MAX <b>{hi==null?'—':fmt(hi)}</b></span><span>SAMPLES <b>{points.length}</b></span></div>
        </>}
      </section>
    })}</div>
  </aside>
}
