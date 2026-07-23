// Physics v2 Phase 2: oriented-box narrow-phase collision (SAT). Pure/deterministic.
// v1 keeps detection-only circle overlap; v2 adds penetration correction + impulse.
import type { SceneObject } from '../planning/types.ts';
import type { CarState } from './vehicle.ts';

export type CollisionBox = { x: number; y: number; yaw: number; hl: number; hw: number };

// car footprint (half length along body-x, half width along body-y)
export const CAR_HL = 1.25, CAR_HW = 0.7;

export function boxForObject(o: SceneObject): CollisionBox {
  const s = o.shape;
  const hl = s.type === 'circle' ? s.radius : s.length / 2;
  const hw = s.type === 'circle' ? s.radius : s.width / 2;
  return { x: o.pose.x, y: o.pose.y, yaw: o.pose.yaw, hl, hw };
}

// Separating Axis Test for two oriented boxes. Returns the minimum-penetration
// push-out direction for box A (unit) and its depth, or null if disjoint.
export function collideBoxes(a: CollisionBox, b: CollisionBox): { normal: [number, number]; depth: number } | null {
  const ax: [number, number][] = [[Math.cos(a.yaw), Math.sin(a.yaw)], [-Math.sin(a.yaw), Math.cos(a.yaw)]];
  const bx: [number, number][] = [[Math.cos(b.yaw), Math.sin(b.yaw)], [-Math.sin(b.yaw), Math.cos(b.yaw)]];
  const axes: [number, number][] = [ax[0], ax[1], bx[0], bx[1]];
  const dx = b.x - a.x, dy = b.y - a.y;
  let minDepth = Infinity, nx = 0, ny = 0;
  for (const e of axes) {
    const ra = a.hl * Math.abs(ax[0][0]*e[0] + ax[0][1]*e[1]) + a.hw * Math.abs(ax[1][0]*e[0] + ax[1][1]*e[1]);
    const rb = b.hl * Math.abs(bx[0][0]*e[0] + bx[0][1]*e[1]) + b.hw * Math.abs(bx[1][0]*e[0] + bx[1][1]*e[1]);
    const dist = dx*e[0] + dy*e[1];
    const overlap = ra + rb - Math.abs(dist);
    if (overlap <= 0) return null;              // found a separating axis
    if (overlap < minDepth) { minDepth = overlap; const s = dist < 0 ? 1 : -1; nx = e[0]*s; ny = e[1]*s; }
  }
  return { normal: [nx, ny], depth: minDepth };
}

// point inside an oriented box (used by v2 LiDAR so corners are not over-reported by a circle).
export function pointInBox(px: number, py: number, b: CollisionBox): boolean {
  const dx = px - b.x, dy = py - b.y, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  return Math.abs(c*dx + s*dy) <= b.hl && Math.abs(-s*dx + c*dy) <= b.hw;
}

export const carBoxOf = (c: CarState): CollisionBox => ({ x: c.x, y: c.y, yaw: c.yaw, hl: CAR_HL, hw: CAR_HW });
const worldVel = (c: CarState): [number, number] => [c.vx*Math.cos(c.yaw) - c.vy*Math.sin(c.yaw), c.vx*Math.sin(c.yaw) + c.vy*Math.cos(c.yaw)];
function setBodyVel(c: CarState, wx: number, wy: number) { const ch = Math.cos(c.yaw), sh = Math.sin(c.yaw); c.vx = wx*ch + wy*sh; c.vy = -wx*sh + wy*ch; }

// 1-body: separate `car` out of an immovable box and kill its into-obstacle velocity. Mutates car.
export function resolveStatic(car: CarState, obstacle: CollisionBox): boolean {
  const hit = collideBoxes(carBoxOf(car), obstacle);
  if (!hit) return false;
  car.x += hit.normal[0]*hit.depth; car.y += hit.normal[1]*hit.depth;
  const [vx, vy] = worldVel(car), vn = vx*hit.normal[0] + vy*hit.normal[1];
  if (vn < 0) setBodyVel(car, vx - vn*hit.normal[0], vy - vn*hit.normal[1]);
  return true;
}

// 2-body: equal-mass, inelastic, deterministic. Splits penetration and normal impulse. Mutates both.
export function resolvePair(a: CarState, aBox: CollisionBox, b: CarState, bBox: CollisionBox): boolean {
  const hit = collideBoxes(aBox, bBox);
  if (!hit) return false;
  const half = hit.depth*0.5;
  a.x += hit.normal[0]*half; a.y += hit.normal[1]*half;
  b.x -= hit.normal[0]*half; b.y -= hit.normal[1]*half;
  const [avx, avy] = worldVel(a), [bvx, bvy] = worldVel(b);
  const rvn = (avx-bvx)*hit.normal[0] + (avy-bvy)*hit.normal[1];
  if (rvn < 0) { const j = -rvn*0.5; setBodyVel(a, avx + j*hit.normal[0], avy + j*hit.normal[1]); setBodyVel(b, bvx - j*hit.normal[0], bvy - j*hit.normal[1]); }
  return true;
}
