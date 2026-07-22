// Shared planning-enabler checks for rule-based, RL, and MPC graphs.
import { buildWorld } from '../src/sim/world.ts';
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

const required=['object.vehicle','objects.nearest','space.blockObject','trajectory.rollout','predict.constantVelocity','intent.passLeft','cost.collision','constraint.track','trajectory.evaluate'];
ok(required.every(type=>!!NT[type]),'registry: common planning enablers are registered');
ok(portType('object.vehicle','object','out')==='object'&&portType('trajectory.rollout','state','in')==='state','validation: planning ports keep distinct types');
ok(!Object.keys(NT).some(type=>/mppi|ppo|sac|overtake|staticAvoidance|localPlanner/i.test(type)),'architecture: no turnkey planner or algorithm node leaked into L0/L1');

console.log(failed?'\n❌ '+failed+' FAILED':'\n✅ ALL PASS — planning enablers correct');
if(failed)process.exit(1);
