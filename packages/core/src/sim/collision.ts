// Physics v2 Phase 2: oriented-box narrow-phase collision (SAT). Pure/deterministic.
// v1 keeps detection-only circle overlap; v2 adds penetration correction + impulse.
import type { SceneObject } from '../planning/types.ts';

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
