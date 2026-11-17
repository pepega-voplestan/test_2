import { useSyncExternalStore } from 'react';

// Temporary GTA VI cosmetics (banner, FPS logo, neon composer) share one
// per-browser switch: window.gta6() toggles, window.gta6(true/false) sets.
const STORAGE_KEY = 'vopley_gta6';

const readStored = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
};

let enabled = readStored();
const listeners = new Set<() => void>();

const setGta6 = (next: boolean) => {
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch { /* storage unavailable — keep in-memory value */ }
  listeners.forEach(l => l());
  console.log(`GTA6: ${next ? 'включён ✅' : 'выключен ❌'}`);
};

(window as any).gta6 = (val?: boolean) => setGta6(val !== undefined ? val : !enabled);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useGta6 = (): boolean => useSyncExternalStore(subscribe, () => enabled);
