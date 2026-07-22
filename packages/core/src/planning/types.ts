import type { Track, World } from '../sim/world.ts'
import { nearestIndex } from '../sim/world.ts'
import type { CarState, Control } from '../sim/vehicle.ts'
import { stepDynamics } from '../sim/vehicle.ts'

export type Point2 = { x:number; y:number }
export type Pose2 = Point2 & { yaw:number }
export type Polygon = Point2[]
export type ObjectShape =
  | { type:'circle'; radius:number; length:number; width:number }
  | { type:'box'; radius:number; length:number; width:number }

export type SceneObject = {
  id:string
  kind:'vehicle'|'static'|'cone'|'debris'
  pose:Pose2
  velocity:Point2
  yawRate:number
  shape:ObjectShape
  confidence:number
}
export type ObjectSet = SceneObject[]

export type CorridorSample = {
  s:number; center:Point2; heading:number; leftWidth:number; rightWidth:number; speedLimit:number
}
export type Corridor = { samples:CorridorSample[]; closed:boolean }
export type DrivableSpace = { reference:Corridor; regions:Polygon[]; blocked:Polygon[] }

export type TrajectoryPoint = { t:number; state:CarState; command:Control }
export type Trajectory = { points:TrajectoryPoint[]; duration:number; valid:boolean }
export type TrajectorySet = Trajectory[]
export type TimedPolygon = { t:number; polygon:Polygon }
export type PredictionHypothesis = { trajectory:Trajectory; occupancy:TimedPolygon[]; probability:number }
export type Prediction = { objectId:string; hypotheses:PredictionHypothesis[] }
export type PredictionSet = Prediction[]

export type IntentMode = 'follow'|'avoid'|'pass-left'|'pass-right'|'yield'|'return-line'|'emergency-stop'
export type BehaviorIntent = {
  mode:IntentMode; targetObjectId:string; targetOffset:number; targetSpeed:number; commitUntil:number; priority:number
}
export type CostKind = 'progress'|'collision'|'clearance'|'tracking'|'smoothness'|'control'
export type CostTerm = { kind:CostKind; weight:number; params:Record<string,number> }
export type ConstraintKind = 'track'|'collision'|'speed'|'accel'|'steer'
export type Constraint = { kind:ConstraintKind; hard:boolean; params:Record<string,number> }
export type PlanningRequest = {
  referencePath:Track; targetProgress:number; targetSpeed:number; preferredOffset:number; targetObjectId:string
  costs:CostTerm[]; constraints:Constraint[]; commitUntil:number
}

export function objectRadius(object:SceneObject){
  return object.shape.type==='circle'?object.shape.radius:Math.hypot(object.shape.length,object.shape.width)/2
}
export function boxPolygon(pose:Pose2,length:number,width:number,margin=0):Polygon{
  const hl=length/2+margin, hw=width/2+margin, c=Math.cos(pose.yaw),s=Math.sin(pose.yaw)
  return [[hl,hw],[hl,-hw],[-hl,-hw],[-hl,hw]].map(([x,y])=>({x:pose.x+c*x-s*y,y:pose.y+s*x+c*y}))
}
export function makeVehicleObject(pose:Pose2,velocity:Point2,length:number,width:number,id='vehicle'):SceneObject{
  return {id,kind:'vehicle',pose:{...pose},velocity:{...velocity},yawRate:0,shape:{type:'box',radius:0,length,width},confidence:1}
}
export function makeStaticObject(pose:Pose2,length:number,width:number,id='static'):SceneObject{
  return {id,kind:'static',pose:{...pose},velocity:{x:0,y:0},yawRate:0,shape:{type:'box',radius:0,length,width},confidence:1}
}
export function relativeObject(object:SceneObject,pose:Pose2){
  const dx=object.pose.x-pose.x,dy=object.pose.y-pose.y,c=Math.cos(pose.yaw),s=Math.sin(pose.yaw)
  const e={x:c*dx+s*dy,y:-s*dx+c*dy};return {e,d:Math.hypot(dx,dy)}
}
export function nearestObject(objects:ObjectSet,pose:Pose2){
  let best:SceneObject|undefined,d=Infinity
  for(const object of objects){const q=Math.hypot(object.pose.x-pose.x,object.pose.y-pose.y)-objectRadius(object);if(q<d){best=object;d=q}}
  return {object:best??makeStaticObject({x:0,y:0,yaw:0},0,0,''),d:best?Math.max(0,d):0,found:!!best}
}
export function objectsInRadius(objects:ObjectSet,pose:Pose2,radius:number){
  return objects.filter(object=>Math.hypot(object.pose.x-pose.x,object.pose.y-pose.y)-objectRadius(object)<=radius)
}

export function corridorFromTrack(track:Track,speedLimit=0):Corridor{
  return {closed:true,samples:track.pts.map((p,i)=>({s:i*track.spacing,center:{x:p[0],y:p[1]},heading:Math.atan2(track.tan[i][1],track.tan[i][0]),leftWidth:track.half,rightWidth:track.half,speedLimit}))}
}
export function spaceFromTrack(track:Track,speedLimit=0):DrivableSpace{
  const left=track.pts.map((p,i)=>({x:p[0]+track.nrm[i][0]*track.half,y:p[1]+track.nrm[i][1]*track.half}))
  const right=track.pts.map((p,i)=>({x:p[0]-track.nrm[i][0]*track.half,y:p[1]-track.nrm[i][1]*track.half})).reverse()
  return {reference:corridorFromTrack(track,speedLimit),regions:[[...left,...right]],blocked:[]}
}
export function blockObject(space:DrivableSpace,object:SceneObject,margin:number):DrivableSpace{
  return {...space,regions:space.regions.map(poly=>poly.map(p=>({...p}))),blocked:[...space.blocked,boxPolygon(object.pose,object.shape.length,object.shape.width,margin)]}
}
export function pointInPolygon(p:Point2,polygon:Polygon){
  let inside=false
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j]
    if(((a.y>p.y)!==(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y||1e-9)+a.x)inside=!inside
  }
  return inside
}
export function spaceContains(space:DrivableSpace,p:Point2){
  let nearest=Infinity,width=0
  for(const sample of space.reference.samples){
    const d=Math.hypot(p.x-sample.center.x,p.y-sample.center.y)
    if(d<nearest){nearest=d;width=Math.max(sample.leftWidth,sample.rightWidth)}
  }
  const inCorridor=space.regions.some(poly=>pointInPolygon(p,poly))||nearest<=width
  return inCorridor&&!space.blocked.some(poly=>pointInPolygon(p,poly))
}

export function currentState(car:CarState):CarState{return {...car}}
export function rolloutTrajectory(state:CarState,command:Control,horizon:number,step:number,world:World):Trajectory{
  const dt=Math.max(1/240,step),count=Math.min(1200,Math.ceil(Math.max(0,horizon)/dt))
  const points:TrajectoryPoint[]=[];let car={...state}
  for(let i=0;i<=count;i++){
    const t=Math.min(horizon,i*dt);points.push({t,state:{...car},command:{...command}})
    if(i<count)car=stepDynamics(car,command,world,Math.min(dt,horizon-i*dt))
  }
  return {points,duration:Math.max(0,horizon),valid:points.every(p=>Number.isFinite(p.state.x)&&Number.isFinite(p.state.y))}
}
function stateFromObject(object:SceneObject,t:number):CarState{
  const x=object.pose.x+object.velocity.x*t,y=object.pose.y+object.velocity.y*t,yaw=object.pose.yaw+object.yawRate*t
  const speed=Math.hypot(object.velocity.x,object.velocity.y)
  return {x,y,yaw,vx:speed,vy:0,r:object.yawRate,delta:0,idx:0,onTrack:true,nz:0,grade:0,beta:0,slipSat:0,v:speed,prevProg:0}
}
export function predictConstantVelocity(object:SceneObject,horizon:number,step:number):Prediction{
  const dt=Math.max(1/30,step),count=Math.min(600,Math.ceil(Math.max(0,horizon)/dt)),points:TrajectoryPoint[]=[],occupancy:TimedPolygon[]=[]
  for(let i=0;i<=count;i++){
    const t=Math.min(horizon,i*dt),state=stateFromObject(object,t),pose={x:state.x,y:state.y,yaw:state.yaw}
    points.push({t,state,command:{steer:0,throttle:0}});occupancy.push({t,polygon:boxPolygon(pose,object.shape.length,object.shape.width)})
  }
  return {objectId:object.id,hypotheses:[{trajectory:{points,duration:Math.max(0,horizon),valid:true},occupancy,probability:1}]}
}
export function trajectoryClearance(trajectory:Trajectory,objects:ObjectSet){
  if(!trajectory.points.length||!objects.length)return Infinity
  let best=Infinity
  for(const p of trajectory.points)for(const object of objects){
    const d=Math.hypot(p.state.x-object.pose.x,p.state.y-object.pose.y)-objectRadius(object);if(d<best)best=d
  }
  return Math.max(0,best)
}
export function trajectoryProgress(trajectory:Trajectory,track:Track){
  if(trajectory.points.length<2)return 0
  const a=nearestIndex(track,trajectory.points[0].state.x,trajectory.points[0].state.y).i
  const b=nearestIndex(track,trajectory.points.at(-1)!.state.x,trajectory.points.at(-1)!.state.y).i
  let delta=b-a
  if(delta>track.N/2)delta-=track.N;else if(delta<-track.N/2)delta+=track.N
  return delta*track.spacing
}
export function trajectorySmoothness(trajectory:Trajectory){
  let sum=0
  for(let i=1;i<trajectory.points.length;i++)sum+=Math.abs(trajectory.points[i].command.steer-trajectory.points[i-1].command.steer)
  return sum
}
function polygonClearance(p:Point2,polygon:Polygon){
  if(pointInPolygon(p,polygon))return 0
  let best=Infinity
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1e-9)))
    best=Math.min(best,Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy)))
  }
  return best
}
export function predictionClearance(trajectory:Trajectory,predictions:PredictionSet){
  let best=Infinity
  for(const prediction of predictions)for(const hypothesis of prediction.hypotheses)for(const p of trajectory.points){
    if(!hypothesis.occupancy.length)continue
    const q=hypothesis.occupancy.reduce((a,b)=>Math.abs(b.t-p.t)<Math.abs(a.t-p.t)?b:a,hypothesis.occupancy[0])
    best=Math.min(best,polygonClearance({x:p.state.x,y:p.state.y},q.polygon))
  }
  return best
}
export function selectMinTrajectory(trajectories:TrajectorySet,costs:number[]){
  if(!trajectories.length)return {trajectory:{points:[],duration:0,valid:false} as Trajectory,i:0}
  let index=0,best=Infinity
  for(let i=0;i<trajectories.length;i++){const cost=Number.isFinite(costs[i])?costs[i]:Infinity;if(cost<best){best=cost;index=i}}
  return {trajectory:trajectories[index],i:index}
}

export function makeIntent(mode:IntentMode,targetSpeed:number,targetOffset:number,commitUntil:number,target?:SceneObject):BehaviorIntent{
  const priority=mode==='emergency-stop'?100:mode==='avoid'?70:mode.startsWith('pass')?60:20
  return {mode,targetObjectId:target?.id??'',targetOffset,targetSpeed,commitUntil,priority}
}
export function requestFromIntent(intent:BehaviorIntent,track:Track,costs:CostTerm[],constraints:Constraint[]):PlanningRequest{
  return {referencePath:track,targetProgress:0,targetSpeed:intent.targetSpeed,preferredOffset:intent.targetOffset,targetObjectId:intent.targetObjectId,costs:[...costs],constraints:[...constraints],commitUntil:intent.commitUntil}
}
export function evaluateTrajectory(trajectory:Trajectory,request:PlanningRequest,objects:ObjectSet,predictions:PredictionSet){
  const track=request.referencePath,clearance=Math.min(trajectoryClearance(trajectory,objects),predictionClearance(trajectory,predictions))
  let total=0,valid=trajectory.valid
  for(const term of request.costs){
    let value=0
    if(term.kind==='progress')value=-trajectoryProgress(trajectory,track)
    else if(term.kind==='collision')value=clearance<(term.params.margin??0)?1:0
    else if(term.kind==='clearance')value=1/Math.max(clearance,term.params.floor??0.1)
    else if(term.kind==='tracking')value=trajectory.points.reduce((sum,p)=>sum+nearestIndex(track,p.state.x,p.state.y).dist,0)/Math.max(1,trajectory.points.length)
    else if(term.kind==='smoothness')value=trajectorySmoothness(trajectory)
    else if(term.kind==='control')value=trajectory.points.reduce((sum,p)=>sum+Math.abs(p.command.steer)+Math.abs(p.command.throttle),0)/Math.max(1,trajectory.points.length)
    total+=term.weight*value
  }
  for(const constraint of request.constraints){
    let satisfied=true
    if(constraint.kind==='track')satisfied=trajectory.points.every(p=>nearestIndex(track,p.state.x,p.state.y).dist<=track.half-(constraint.params.margin??0))
    else if(constraint.kind==='collision')satisfied=clearance>=(constraint.params.margin??0)
    else if(constraint.kind==='speed')satisfied=trajectory.points.every(p=>p.state.vx<=(constraint.params.max??Infinity))
    else if(constraint.kind==='steer')satisfied=trajectory.points.every(p=>Math.abs(p.command.steer)<=(constraint.params.max??1))
    else if(constraint.kind==='accel')satisfied=trajectory.points.every(p=>Math.abs(p.command.throttle)<=(constraint.params.max??1))
    if(!satisfied){if(constraint.hard)valid=false;else total+=constraint.params.penalty??1000}
  }
  return {cost:total,valid,clearance:Number.isFinite(clearance)?clearance:0}
}
