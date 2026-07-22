import { buildWorld } from '@apex/core'
import type { Height, Vec2, World, SceneObject } from '@apex/core'

export type MissionVenue = {
  world: World
  name: string
  layout: string
  kind: 'pad' | 'dyno' | 'circuit'
}

const flatHeight = (): Height => ({
  at:() => 0,
  grad:() => [0,0],
  zmin:0, zmax:0, zlo:0, zhi:0,
})

type SceneSpec = { id:string; kind:'static'|'vehicle'; at:number; offset?:number; speed?:number; length?:number; width?:number }

const venue = (name:string, layout:string, kind:MissionVenue['kind'], ctrl:Vec2[],
  opts:{ half:number; mu?:number; flat?:boolean; scene?:SceneSpec[] }): MissionVenue => {
  const world = buildWorld({ ctrl, half:opts.half, mu:opts.mu })
  if (opts.flat) world.height = flatHeight()
  world.objects=(opts.scene??[]).map(spec=>{
    const i=((spec.at%world.track.N)+world.track.N)%world.track.N
    const p=world.track.pts[i],n=world.track.nrm[i],t=world.track.tan[i],offset=spec.offset??0
    return {
      id:spec.id,kind:spec.kind,trackIndex:spec.speed!=null?i:undefined,trackSpeed:spec.speed,
      pose:{x:p[0]+n[0]*offset,y:p[1]+n[1]*offset,yaw:Math.atan2(t[1],t[0])},
      velocity:spec.speed!=null?{x:t[0]*spec.speed,y:t[1]*spec.speed}:{x:0,y:0},
      yawRate:0,shape:{type:'box',radius:0,length:spec.length??3.8,width:spec.width??1.8},confidence:1,
    } satisfies SceneObject
  })
  return { world, name, layout, kind }
}

export function missionVenue(id:string): MissionVenue {
  if (id === 'tut') return venue('IGNITION PAD', 'PIT APRON · BAY 00', 'pad', [
    [0,0],[38,0],[62,18],[62,48],[38,66],[0,66],[-24,48],[-24,18],
  ], { half:10, flat:true })

  if (id === 'l1') return venue('VELOCITY LAB', 'FLAT STRAIGHT · 01', 'dyno', [
    [0,0],[100,0],[200,0],[260,40],[200,80],[100,80],[0,80],[-60,40],[-100,0],
  ], { half:7, flat:true })

  if (id === 'l2') return venue('ORBIT CIRCUIT', 'FLOW LOOP · 02', 'circuit', [
    [18,46],[28,18],[62,8],[102,18],[122,43],[108,70],[72,82],[34,72],
  ], { half:6, mu:1.05 })

  if (id === 'l3') return venue('RIDGELINE', 'SWITCHBACK · 03', 'circuit', [
    [20,45],[30,15],[60,10],[82,28],[105,16],[118,42],[102,68],[72,62],
    [48,78],[25,66],
  ], { half:6.5, mu:1 })

  if (id === 'l4') return venue('SENSOR CANYON', 'NARROW S-RUN · 04', 'circuit', [
    [10,45],[20,20],[50,10],[80,18],[105,35],[108,58],[82,72],[52,62],
    [30,72],
  ], { half:4.2, mu:1 })

  if (id === 'l5') return venue('CONTAINER YARD', 'BLOCKED APEX · 05', 'circuit', [
    [8,42],[18,16],[48,8],[82,14],[108,34],[104,62],[76,76],[42,68],[18,62],
  ], { half:6.2, mu:1, flat:true, scene:[
    {id:'barrier-a',kind:'static',at:62,offset:0,length:4.8,width:2.2},
    {id:'barrier-b',kind:'static',at:190,offset:-0.8,length:3.2,width:2},
  ] })

  return venue('DUEL RING', 'OVERTAKE LOOP · 06', 'circuit', [
    [12,42],[24,14],[58,7],[96,12],[120,38],[110,68],[74,79],[36,70],
  ], { half:7.2, mu:1.05, flat:true, scene:[
    {id:'rival-07',kind:'vehicle',at:34,offset:0,speed:6.5,length:4.2,width:1.9},
  ] })
}
