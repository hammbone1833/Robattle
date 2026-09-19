/**
 * Player preferences.
 *
 * Auto-detection gets the control scheme right most of the time and wrong often enough to
 * matter: touchscreen laptops report touch support but are played with a keyboard, a phone
 * plugged into a dock is not, and a tablet with a case keyboard could be either. So the
 * detection is only the *default* -- the player can always say which one they are using,
 * and that choice is remembered.
 */

import { QUALITY, detectQuality, isTouchDevice, isCoarsePointer } from './device.js';

const KEY = 'robattle3d.settings.v1';

export const DEFAULTS = {
  controls: 'auto',      // 'auto' | 'keyboard' | 'touch'
  quality: 'auto',       // 'auto' | 'low' | 'medium' | 'high'
  sensitivity: 1,        // look speed multiplier, 0.4 .. 2.2
  invertY: false,
};

export const CONTROL_CHOICES = [
  { id: 'auto', label: 'Auto', blurb: 'Detect from the device. Right most of the time.' },
  { id: 'keyboard', label: 'Keyboard & mouse', blurb: 'WASD to move, mouse to aim, click to fire. Hides the on-screen pad.' },
  { id: 'touch', label: 'Touch controls', blurb: 'On-screen stick and buttons. Works on a desktop with a touchscreen too.' },
];

export const QUALITY_CHOICES = [
  { id: 'auto', label: 'Auto', blurb: 'Chosen from the device on load.' },
  { id: 'low', label: 'Low', blurb: 'No shadows, no crowd, lowest resolution. Best on older phones.' },
  { id: 'medium', label: 'Medium', blurb: 'Shadows and a thinner crowd at reduced resolution.' },
  { id: 'high', label: 'High', blurb: 'Everything on at full resolution. For desktops.' },
];

let cache = null;
const listeners = new Set();

export function loadSettings() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  // A stored value from an older build must never put the game in an unusable state.
  if (!CONTROL_CHOICES.some((c) => c.id === cache.controls)) cache.controls = DEFAULTS.controls;
  if (!QUALITY_CHOICES.some((c) => c.id === cache.quality)) cache.quality = DEFAULTS.quality;
  cache.sensitivity = Math.min(2.2, Math.max(0.4, Number(cache.sensitivity) || 1));
  cache.invertY = !!cache.invertY;
  return cache;
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  for (const fn of listeners) fn(next);
  return next;
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** What the detector would pick, for showing next to the Auto option. */
export function detectedControls() {
  return isTouchDevice() || isCoarsePointer() ? 'touch' : 'keyboard';
}

/** Resolve 'auto' down to a concrete answer. */
export function resolveControls(settings = loadSettings()) {
  return settings.controls === 'auto' ? detectedControls() : settings.controls;
}

export function resolveQuality(settings = loadSettings()) {
  return settings.quality === 'auto' ? detectQuality() : (QUALITY[settings.quality] ?? detectQuality());
}
