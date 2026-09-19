/**
 * Device capability detection and quality tiers.
 *
 * A phone GPU will not run the same scene a desktop does at a playable frame rate, and
 * the honest fix is to render less rather than to render the same thing badly. Each tier
 * below is a budget: pixel ratio, shadows, crowd size and effect pool sizes all scale
 * together, and the game is identical in every tier -- only the pixels differ.
 */

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
}

/** True for finger/stylus input, where hover and precise pointing are unavailable. */
export function isCoarsePointer() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** Pointer lock is unavailable or useless on phones; drag-to-look is used instead. */
export function supportsPointerLock() {
  return !isTouchDevice() && typeof document !== 'undefined' && 'pointerLockElement' in document;
}

export const QUALITY = {
  low: {
    name: 'low',
    maxPixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 512,
    crowd: 0,
    sparkPool: 90,
    tracerCount: 70,
    antialias: false,
    fogScale: 1.25,          // pull the far plane in with heavier fog
    drawDistance: 180,
  },
  medium: {
    name: 'medium',
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 512,
    crowd: 140,
    sparkPool: 160,
    tracerCount: 110,
    antialias: true,
    fogScale: 1.1,
    drawDistance: 280,
  },
  high: {
    name: 'high',
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 1024,
    crowd: 480,
    sparkPool: 260,
    tracerCount: 160,
    antialias: true,
    fogScale: 1,
    drawDistance: 400,
  },
};

/**
 * Pick a tier. Touch devices start a rung down because their pixel ratios are high and
 * their thermal budget is not; a very small screen or a low core count drops another.
 */
export function detectQuality() {
  if (typeof window === 'undefined') return QUALITY.high;

  const cores = navigator.hardwareConcurrency ?? 4;
  const touch = isTouchDevice();
  const dpr = window.devicePixelRatio || 1;
  const small = Math.min(window.screen?.width ?? 1920, window.screen?.height ?? 1080) < 500;
  const memory = navigator.deviceMemory ?? 4;

  if (!touch) return cores <= 2 ? QUALITY.medium : QUALITY.high;
  if (cores <= 4 || memory <= 3 || (small && dpr >= 3)) return QUALITY.low;
  return QUALITY.medium;
}
