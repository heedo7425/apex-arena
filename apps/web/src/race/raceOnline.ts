import { PHYSICS_VERSION, type PhysicsVersion } from '@apex/core'

export type RaceMode='time-trial'|'head-to-head'|'grid-start'
export type LeaderboardEntry={rank:number;player:string;time:number;verified:boolean;algorithm:string;physicsVersion:PhysicsVersion}
export type RunSubmission={version:PhysicsVersion;physicsVersion:PhysicsVersion;mode:RaceMode;playerId:string;designHash:string;seed:number;lapTime:number;dirty:boolean;inputsHash:string}
export type MatchTicket={version:PhysicsVersion;physicsVersion:PhysicsVersion;mode:Exclude<RaceMode,'time-trial'>;playerId:string;designHash:string;region:string}

const api=(import.meta.env.VITE_RACE_API_URL as string|undefined)?.replace(/\/$/,'')
const ws=import.meta.env.VITE_RACE_WS_URL as string|undefined
export const raceNetwork={configured:!!api&&!!ws,api,ws}

export function playerId(){let id=localStorage.getItem('apex_player_id');if(!id){id=crypto.randomUUID();localStorage.setItem('apex_player_id',id)}return id}
export function hashDesign(value:unknown){const text=JSON.stringify(value);let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}

export async function submitRun(run:RunSubmission){if(!api)return null;const response=await fetch(`${api}/runs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(run)});if(!response.ok)throw new Error(`run submit ${response.status}`);return response.json()}

export async function fetchLeaderboard(mode:RaceMode):Promise<LeaderboardEntry[]>{
  if(!api)return []
  const response=await fetch(`${api}/leaderboard?mode=${encodeURIComponent(mode)}`)
  if(!response.ok)throw new Error(`leaderboard ${response.status}`)
  const entries=await response.json() as LeaderboardEntry[]
  return entries.filter(entry=>entry.physicsVersion===PHYSICS_VERSION)
}

export function joinMatch(ticket:MatchTicket,onMessage:(value:unknown)=>void){
  if(!ws)throw new Error('VITE_RACE_WS_URL is not configured')
  const socket=new WebSocket(ws)
  socket.addEventListener('open',()=>socket.send(JSON.stringify({type:'queue.join',ticket})))
  socket.addEventListener('message',event=>{try{onMessage(JSON.parse(event.data))}catch{}})
  return ()=>socket.close()
}
