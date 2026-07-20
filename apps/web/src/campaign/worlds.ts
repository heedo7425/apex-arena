import { buildWorld } from '@apex/core'
import type { Height, Vec2, World } from '@apex/core'

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

const venue = (name:string, layout:string, kind:MissionVenue['kind'], ctrl:Vec2[],
  opts:{ half:number; mu?:number; flat?:boolean }): MissionVenue => {
  const world = buildWorld({ ctrl, half:opts.half, mu:opts.mu })
  if (opts.flat) world.height = flatHeight()
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

  return venue('SENSOR CANYON', 'NARROW S-RUN · 04', 'circuit', [
    [10,45],[20,20],[50,10],[80,18],[105,35],[108,58],[82,72],[52,62],
    [30,72],
  ], { half:4.2, mu:1 })
}
