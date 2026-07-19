// Display metadata for palette + editor nodes. Ports (ins/outs) come from core NT.
import { NT } from '@apex/core'

export type ParamSpec = { key:string; label:string; min:number; max:number; step:number; def:number }
export type Meta = { label:string; cat:string; params?:ParamSpec[] }

// category colors (lane-ish)
export const CAT_COLOR: Record<string,string> = {
  Sensors:'#6FA8DC', Math:'#9AA6B4', Logic:'#E4736A', Array:'#B58BE0',
  Geometry:'#E7B24C', Planning:'#E7B24C', Control:'#1FDDC9', Random:'#c98bff', Model:'#8fd6c9', Output:'#1FDDC9',
}

export const META: Record<string, Meta> = {
  'src.scan':{label:'LiDAR scan',cat:'Sensors'},
  'src.speed':{label:'Speed',cat:'Sensors'},
  'src.pose':{label:'Pose',cat:'Sensors'},
  'src.track':{label:'Track',cat:'Sensors'},
  'const':{label:'Const',cat:'Math',params:[{key:'value',label:'value',min:-20,max:20,step:0.1,def:1}]},
  'add':{label:'+',cat:'Math'},'sub':{label:'−',cat:'Math'},'mul':{label:'×',cat:'Math'},'div':{label:'÷',cat:'Math'},
  'abs':{label:'abs',cat:'Math'},
  'clamp':{label:'clamp',cat:'Math',params:[{key:'lo',label:'lo',min:-2,max:2,step:0.1,def:-1},{key:'hi',label:'hi',min:-2,max:2,step:0.1,def:1}]},
  'lt':{label:'<',cat:'Logic'},'select':{label:'select',cat:'Logic'},
  'array.argmax':{label:'argmax',cat:'Array'},'array.max':{label:'max',cat:'Array'},'array.len':{label:'len',cat:'Array'},
  'array.map':{label:'Map',cat:'Array'},
  'std.lookahead':{label:'Lookahead point',cat:'Geometry'},
  'std.tocar':{label:'To car frame',cat:'Geometry'},
  'std.pursuitCurv':{label:'Pursuit curvature',cat:'Control'},
  'std.steerFromCurv':{label:'Steer from curv',cat:'Control'},
  'std.curvAhead':{label:'Curvature ahead',cat:'Geometry'},
  'std.gripSpeed':{label:'Grip speed',cat:'Planning',params:[{key:'vmax',label:'vmax',min:6,max:17,step:0.5,def:13},{key:'margin',label:'margin',min:0.5,max:1.05,step:0.02,def:0.85}]},
  'ctrl.pid':{label:'PID',cat:'Control',params:[{key:'kp',label:'kp',min:0,max:2,step:0.05,def:0.6},{key:'ki',label:'ki',min:0,max:0.3,step:0.01,def:0.06},{key:'kd',label:'kd',min:0,max:0.5,step:0.01,def:0}]},
  'rng.uniform':{label:'rand',cat:'Random'},'rng.gauss':{label:'gauss',cat:'Random'},
  'sim.predict':{label:'predict (model)',cat:'Model'},
  'sink.steer':{label:'▸ STEER',cat:'Output'},'sink.throttle':{label:'▸ THROTTLE',cat:'Output'},
}

export function ins(type:string):string[]{ return NT[type]?.ins ?? [] }
export function outs(type:string):string[]{ return NT[type]?.outs ?? [] }
export function metaOf(type:string):Meta{ return META[type] ?? {label:type,cat:'Math'} }
export function colorOf(type:string):string{ return CAT_COLOR[metaOf(type).cat] ?? '#9AA6B4' }
export function defaultParams(type:string):Record<string,number>{
  const o:Record<string,number>={}; (metaOf(type).params??[]).forEach(p=>o[p.key]=p.def); return o
}

// palette grouped by category (which node types the player can drop)
export const PALETTE_CATS: {cat:string; types:string[]}[] = [
  {cat:'Sensors',  types:['src.scan','src.speed','src.pose','src.track']},
  {cat:'Math',     types:['const','add','sub','mul','div','abs','clamp']},
  {cat:'Logic',    types:['lt','select']},
  {cat:'Array',    types:['array.argmax','array.max','array.len']},
  {cat:'Geometry', types:['std.lookahead','std.tocar','std.curvAhead']},
  {cat:'Control',  types:['std.pursuitCurv','std.steerFromCurv','ctrl.pid']},
  {cat:'Planning', types:['std.gripSpeed']},
  {cat:'Output',   types:['sink.steer','sink.throttle']},
]
