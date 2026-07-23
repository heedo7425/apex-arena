// Shared planning-enabler checks for rule-based, RL, and MPC graphs.
import { buildWorld } from '../src/sim/world.ts';
import { makeGraph } from '../src/graph/engine.ts';
import { runFor } from '../src/sim/runner.ts';
import { initCar } from '../src/sim/vehicle.ts';
import {
  makeVehicleObject, makeStaticObject, nearestObject, objectsInRadius, relativeObject,
  spaceFromTrack, blockObject, spaceContains, rolloutTrajectory, predictConstantVelocity,
  trajectoryClearance, trajectoryProgress, predictionClearance, selectMinTrajectory, makeIntent,
  requestFromIntent, evaluateTrajectory, type CostTerm, type Constraint,
} from '../src/planning/types.ts';
import { NT } from '../src/graph/registry.ts';
import { portType } from '../src/graph/validate.ts';

let failed=0;
function ok(condition:boolean,message:string){console.log((condition?'PASS ':'FAIL ')+message);if(!condition)failed++}
const near=(a:number,b:number,e=1e-9)=>Math.abs(a-b)<e;
const world=buildWorld(), car=initCar(world);
const egoPose={x:car.x,y:car.y,yaw:car.yaw};
const ahead={x:car.x+Math.cos(car.yaw)*8,y:car.y+Math.sin(car.yaw)*8,yaw:car.yaw};
const side={x:car.x-Math.sin(car.yaw)*3,y:car.y+Math.cos(car.yaw)*3,yaw:car.yaw};

const moving=makeVehicleObject(ahead,{x:2,y:0},4.5,1.9,'rival');
const cone=makeStaticObject(side,0.5,0.5,'cone');
const objects=[moving,cone];
const nearest=nearestObject(objects,egoPose);
ok(nearest.found&&nearest.object.id==='cone','scene: nearest object selects by surface distance');
ok(objectsInRadius(objects,egoPose,5).length===1,'scene: radius query filters distant objects');
const relative=relativeObject(moving,egoPose);
ok(near(relative.e.x,8)&&near(relative.e.y,0),'scene: relative object uses ego frame');

const openSpace=spaceFromTrack(world.track,12);
ok(spaceContains(openSpace,{x:car.x,y:car.y}),'space: track center is drivable');
const blocked=blockObject(openSpace,makeStaticObject(egoPose,2,2),0.5);
ok(!spaceContains(blocked,{x:car.x,y:car.y}),'space: obstacle occupancy removes drivable area');

const command={steer:0,throttle:0.4};
const trajectoryA=rolloutTrajectory(car,command,1,0.1,world);
const trajectoryB=rolloutTrajectory(car,command,1,0.1,world);
ok(trajectoryA.points.length===11&&trajectoryA.valid,'trajectory: rollout creates a finite horizon candidate');
ok(JSON.stringify(trajectoryA)===JSON.stringify(trajectoryB),'trajectory: rollout is deterministic');
ok(trajectoryClearance(trajectoryA,[makeStaticObject(egoPose,1,1)])===0,'trajectory: current obstacle produces zero clearance');
ok(rolloutTrajectory(car,command,0,0.1,world).points.length===1,'trajectory: zero horizon contains only the initial state');
{
  const a=world.track.pts[10],b=world.track.pts[9];
  const backward={points:[{t:0,state:{...car,x:a[0],y:a[1]},command},{t:0.1,state:{...car,x:b[0],y:b[1]},command}],duration:0.1,valid:true};
  ok(trajectoryProgress(backward,world.track)<0,'trajectory: short backward motion is not mistaken for a full lap');
}


const prediction=predictConstantVelocity(moving,1,0.1);
const predictedEnd=prediction.hypotheses[0].trajectory.points.at(-1)!.state;
ok(near(predictedEnd.x,moving.pose.x+moving.velocity.x),'prediction: constant velocity advances object position');
ok(Number.isFinite(predictionClearance(trajectoryA,[prediction])),'prediction: time-aligned clearance is finite');
ok(near(predictedEnd.yaw,moving.pose.yaw),'prediction: object yaw starts from pose yaw');
const occupied={points:[{t:0,state:{...car,x:moving.pose.x,y:moving.pose.y},command}],duration:0,valid:true};
ok(predictionClearance(occupied,[prediction])===0,'prediction: clearance uses object occupancy, not only its center');


const left=makeIntent('pass-left',10,2,3,moving), right=makeIntent('pass-right',10,-2,3,moving);
ok(left.targetOffset>0&&right.targetOffset<0&&left.targetObjectId==='rival','behavior: pass intents preserve side and target');
ok(makeIntent('emergency-stop',0,0,1).priority>left.priority,'behavior: emergency intent has highest priority');

const costs:CostTerm[]=[{kind:'progress',weight:1,params:{}},{kind:'collision',weight:100,params:{margin:1}}];
const constraints:Constraint[]=[{kind:'track',hard:true,params:{margin:0.1}},{kind:'collision',hard:true,params:{margin:1}}];
const request=requestFromIntent(makeIntent('follow',8,0,2),world.track,costs,constraints);
const safe=evaluateTrajectory(trajectoryA,request,[],[]);
const unsafe=evaluateTrajectory(trajectoryA,request,[makeStaticObject(egoPose,1,1)],[]);
ok(safe.valid&&!unsafe.valid,'planning: hard collision constraint rejects unsafe candidate');
ok(selectMinTrajectory([trajectoryA,{...trajectoryA,duration:2}],[5,2]).i===1,'planning: minimum-cost candidate is selected');

// Complete reference graphs prove the boundaries compose into runnable MPC and RL missions.
const mpcWorld=buildWorld({ctrl:[[10,40],[22,13],[55,6],[91,14],[112,38],[103,65],[70,76],[37,68],[17,58]],half:6.8,mu:1.05});
const mpcGraph=makeGraph({
  state:{type:'src.vehicleState'},track:{type:'src.track'},base:{type:'blk.pursuit'},target:{type:'const',params:{value:8}},speed:{type:'blk.speedPid',in:{target:['n','target','v']}},delta:{type:'const',params:{value:0.08}},
  left:{type:'add',in:{a:['n','base','steer'],b:['n','delta','v']}},right:{type:'sub',in:{a:['n','base','steer'],b:['n','delta','v']}},
  c1:{type:'command.make',in:{steer:['n','left','v'],throttle:['n','speed','throttle']}},c2:{type:'command.make',in:{steer:['n','right','v'],throttle:['n','speed','throttle']}},
  horizon:{type:'const',params:{value:0.6}},step:{type:'const',params:{value:0.1}},
  r1:{type:'trajectory.rollout',in:{state:['n','state','state'],command:['n','c1','command'],horizon:['n','horizon','v'],step:['n','step','v']}},r2:{type:'trajectory.rollout',in:{state:['n','state','state'],command:['n','c2','command'],horizon:['n','horizon','v'],step:['n','step','v']}},
  p1:{type:'trajectory.progress',in:{trajectory:['n','r1','trajectory'],track:['n','track','track']}},p2:{type:'trajectory.progress',in:{trajectory:['n','r2','trajectory'],track:['n','track','track']}},n1:{type:'neg',in:{x:['n','p1','d']}},n2:{type:'neg',in:{x:['n','p2','d']}},costs:{type:'array.pack2',in:{a:['n','n1','v'],b:['n','n2','v']}},
  empty:{type:'trajectories.empty'},set1:{type:'trajectories.append',in:{trajectories:['n','empty','trajectories'],trajectory:['n','r1','trajectory']}},set2:{type:'trajectories.append',in:{trajectories:['n','set1','trajectories'],trajectory:['n','r2','trajectory']}},pick:{type:'trajectories.selectMin',in:{trajectories:['n','set2','trajectories'],costs:['n','costs','v']}},zero:{type:'const',params:{value:0}},command:{type:'trajectory.commandAt',in:{trajectory:['n','pick','trajectory'],i:['n','zero','v']}},parts:{type:'command.parts',in:{command:['n','command','command']}},ssink:{type:'sink.steer',in:{x:['n','parts','steer']}},tsink:{type:'sink.throttle',in:{x:['n','parts','throttle']}},
});
const mpcRun=runFor(mpcWorld,mpcGraph,1,70);
ok(mpcRun.bestClean!==null,'integration: two-candidate MPC graph completes a clean lap');

const rlWorld=buildWorld({ctrl:[[8,43],[18,18],[46,8],[78,12],[105,30],[111,55],[91,73],[59,70],[31,79],[13,64]],half:7,mu:1.05});
const rlGraph=makeGraph({
  pose:{type:'src.pose'},track:{type:'src.track'},speed:{type:'src.speed'},state:{type:'src.vehicleState'},stateParts:{type:'state.parts',in:{state:['n','state','state']}},
  cte:{type:'std.crossTrack',in:{pose:['n','pose','pose'],track:['n','track','track']}},heading:{type:'std.headingErr',in:{pose:['n','pose','pose'],track:['n','track','track']}},policy:{type:'policy.linear2',params:{w1:-0.4,w2:1.8,b:0},in:{x1:['n','cte','e'],x2:['n','heading','e']}},limited:{type:'clamp',params:{lo:-1,hi:1},in:{x:['n','policy','action']}},ssink:{type:'sink.steer',in:{x:['n','limited','v']}},
  target:{type:'const',params:{value:8}},speedctl:{type:'blk.speedPid',in:{target:['n','target','v']}},tsink:{type:'sink.throttle',in:{x:['n','speedctl','throttle']}},reward:{type:'reward.track',in:{speed:['n','speed','v'],cte:['n','cte','e'],onTrack:['n','stateParts','onTrack']}},rewardSink:{type:'sink.reward',in:{x:['n','reward','reward']}},
});
const rlRun=runFor(rlWorld,rlGraph,1,70);
ok(rlRun.bestClean!==null,'integration: policy-action and reward paths complete a clean evaluation lap');

const required=['object.vehicle','objects.nearest','space.blockObject','trajectory.rollout','predict.constantVelocity','intent.passLeft','cost.collision','constraint.track','trajectory.evaluate'];
ok(required.every(type=>!!NT[type]),'registry: common planning enablers are registered');
ok(portType('object.vehicle','object','out')==='object'&&portType('trajectory.rollout','state','in')==='state','validation: planning ports keep distinct types');
ok(!Object.keys(NT).some(type=>/mppi|ppo|sac|overtake|staticAvoidance|localPlanner/i.test(type)),'architecture: no turnkey planner or algorithm node leaked into L0/L1');

console.log(failed?'\n❌ '+failed+' FAILED':'\n✅ ALL PASS — planning enablers correct');
if(failed)process.exit(1);
