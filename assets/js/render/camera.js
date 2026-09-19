/**
 * Third-person camera helpers shared by the village and the arena.
 *
 * The camera sits behind and to one side of the robot you are driving. The shoulder
 * offset is not decoration: with the camera directly behind, your own medabot stands in
 * front of the crosshair and hides the thing you are aiming at.
 */

export const SHOULDER = 0.95;

/** Unit vectors for a yaw angle, matching the rig's convention (+Z is forward at yaw 0). */
export function basis(yaw) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return { fx: s, fz: c, rx: c, rz: -s };
}

/**
 * Pull the camera in if the ideal position is inside a wall, so backing into scenery
 * never buries the view inside geometry.
 * @param {{x:number,y:number,z:number}} focus  point the camera is orbiting
 * @param {{x:number,y:number,z:number}} want   ideal camera position
 * @param {Array} boxes  [{x, z, hw, hd, h}] solid volumes
 * @param {number} minDist  never come closer to the focus than this
 */
export function resolveOcclusion(focus, want, boxes, minDist = 1.6) {
  const dx = want.x - focus.x, dy = want.y - focus.y, dz = want.z - focus.z;
  const full = Math.hypot(dx, dy, dz);
  if (full < 0.001 || !boxes?.length) return want;

  const pad = 0.45;
  const steps = Math.max(4, Math.ceil(full / 0.4));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = focus.x + dx * t, y = focus.y + dy * t, z = focus.z + dz * t;
    for (const b of boxes) {
      const hw = b.hw ?? b[2], hd = b.hd ?? b[3], h = b.h ?? b[4] ?? 99;
      const bx = b.x ?? b[0], bz = b.z ?? b[1];
      if (y <= h + pad && Math.abs(x - bx) <= hw + pad && Math.abs(z - bz) <= hd + pad) {
        // Back off to just before the obstruction.
        const safe = Math.max(minDist / full, (i - 1) / steps);
        return { x: focus.x + dx * safe, y: focus.y + dy * safe, z: focus.z + dz * safe };
      }
    }
  }
  return want;
}
