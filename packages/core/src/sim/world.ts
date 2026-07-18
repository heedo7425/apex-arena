// World = track geometry + height field + vehicle params. Pure, framework-free.
export type Vec2 = [number, number];

export type Track = {
  pts: Vec2[]; tan: Vec2[]; nrm: Vec2[]; curv: number[];
  spacing: number; N: number; total: number; half: number;
};
export type Height = {
  at(x: number, y: number): number;
  grad(x: number, y: number): [number, number];
  zmin: number; zmax: number; zlo: number; zhi: number;
};
export type VehicleParams = {
  M: number; IZ: number; LF: number; LR: number; L: number; HCG: number;
  CF: number; CR: number; FXDRIVE: number; FXBRAKE: number; DRAGC: number; ROLL: number;
  MAXSTEER: number; MAXSTEERVEL: number;
};
export type World = { track: Track; height: Height; vp: VehicleParams; mu: number; muGrass: number };

export const G = 9.81;
export const DT = 1 / 120;

export const DEFAULT_VP: VehicleParams = {
  M: 1000, IZ: 1400, LF: 1.25, LR: 1.35, L: 2.6, HCG: 0.5,
  CF: 105000, CR: 115000, FXDRIVE: 9000, FXBRAKE: 13000, DRAGC: 11, ROLL: 140,
  MAXSTEER: 0.5, MAXSTEERVEL: 3.6,
};
export const DEFAULT_CTRL: Vec2[] = [[25,45],[30,22],[55,14],[80,18],[100,32],[104,55],[85,68],[58,64],[40,66]];

function catmull(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
    0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3),
  ];
}
function buildCenterline(ctrl: Vec2[], spacing: number) {
  const n = ctrl.length; const raw: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i-1+n)%n], p1 = ctrl[i], p2 = ctrl[(i+1)%n], p3 = ctrl[(i+2)%n];
    for (let s = 0; s < 24; s++) raw.push(catmull(p0, p1, p2, p3, s/24));
  }
  const cum = [0];
  for (let k = 1; k < raw.length; k++) cum.push(cum[k-1] + Math.hypot(raw[k][0]-raw[k-1][0], raw[k][1]-raw[k-1][1]));
  const total = cum[cum.length-1] + Math.hypot(raw[0][0]-raw[raw.length-1][0], raw[0][1]-raw[raw.length-1][1]);
  const m = Math.round(total / spacing); const out: Vec2[] = [];
  for (let j = 0; j < m; j++) {
    const d = (j/m)*total; let lo = 0;
    while (lo < cum.length-1 && cum[lo+1] < d) lo++;
    const seg = ((cum[lo+1] !== undefined ? cum[lo+1] : total) - cum[lo]);
    const f = seg > 1e-6 ? (d - cum[lo]) / seg : 0;
    const a = raw[lo], b = raw[(lo+1)%raw.length];
    out.push([a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f]);
  }
  return { pts: out, total, spacing: total/m };
}

export function makeHeight(): Height {
  const at = (x: number, y: number) =>
    11*Math.exp(-((x-84)*(x-84)+(y-38)*(y-38))/(2*15*15)) +
    5.5*Math.exp(-((x-38)*(x-38)+(y-58)*(y-58))/(2*12*12)) +
    0.9*Math.sin(x*0.07) + 0.7*Math.cos(y*0.09) + 1.6;
  const grad = (x: number, y: number): [number, number] => {
    const e = 0.5;
    return [(at(x+e,y)-at(x-e,y))/(2*e), (at(x,y+e)-at(x,y-e))/(2*e)];
  };
  let zlo = 1e9, zhi = -1e9;
  for (let gx = 8; gx <= 118; gx += 2) for (let gy = 4; gy <= 76; gy += 2) { const z = at(gx,gy); if (z<zlo)zlo=z; if (z>zhi)zhi=z; }
  return { at, grad, zmin: 0, zmax: 0, zlo, zhi };
}

export function buildWorld(opts: { ctrl?: Vec2[]; spacing?: number; half?: number; mu?: number; vp?: VehicleParams } = {}): World {
  const ctrl = opts.ctrl ?? DEFAULT_CTRL;
  const spacing = opts.spacing ?? 1.0;
  const half = opts.half ?? 4.6;
  const cl = buildCenterline(ctrl, spacing);
  const N = cl.pts.length;
  const tan: Vec2[] = [], nrm: Vec2[] = [], curv: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = cl.pts[(i-1+N)%N], b = cl.pts[(i+1)%N];
    const tx = b[0]-a[0], ty = b[1]-a[1], tl = Math.hypot(tx,ty) || 1;
    tan.push([tx/tl, ty/tl]); nrm.push([-ty/tl, tx/tl]);
  }
  for (let i = 0; i < N; i++) { const t0 = tan[(i-1+N)%N], t1 = tan[(i+1)%N]; curv.push((t0[0]*t1[1]-t0[1]*t1[0])/(2*cl.spacing)); }
  const height = makeHeight();
  let zmin = 1e9, zmax = -1e9;
  for (let i = 0; i < N; i++) { const z = height.at(cl.pts[i][0], cl.pts[i][1]); if (z<zmin)zmin=z; if (z>zmax)zmax=z; }
  height.zmin = zmin; height.zmax = zmax;
  const track: Track = { pts: cl.pts, tan, nrm, curv, spacing: cl.spacing, N, total: cl.total, half };
  return { track, height, vp: opts.vp ?? DEFAULT_VP, mu: opts.mu ?? 1.0, muGrass: 0.45 };
}

export function nearestIndex(track: Track, x: number, y: number, hint?: number): { i: number; dist: number } {
  const N = track.N; let bi = 0, bd = 1e18;
  const lo = hint != null ? hint - 40 : 0, hi = hint != null ? hint + 40 : N;
  for (let k = lo; k < hi; k++) { const i = ((k%N)+N)%N; const dx = track.pts[i][0]-x, dy = track.pts[i][1]-y, d = dx*dx+dy*dy; if (d < bd) { bd = d; bi = i; } }
  return { i: bi, dist: Math.sqrt(bd) };
}
export function curvAheadAt(track: Track, idx: number, meters: number): number {
  const s = Math.round(meters / track.spacing); let mx = 0;
  for (let k = 2; k < s; k++) { const c = Math.abs(track.curv[(idx+k)%track.N]); if (c > mx) mx = c; }
  return mx;
}
