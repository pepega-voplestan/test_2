import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// ── localStorage polyfill for jsdom 28 ────────────────────────────────────────
// jsdom 28 requires --localstorage-file for a real Storage implementation.
// Without a valid path the stub has no methods. Provide a simple in-memory one.
const _lsStore = new Map<string, string>();
const mockLocalStorage: Storage = {
  getItem: (key: string) => _lsStore.get(key) ?? null,
  setItem: (key: string, value: string) => { _lsStore.set(key, String(value)); },
  removeItem: (key: string) => { _lsStore.delete(key); },
  clear: () => { _lsStore.clear(); },
  get length() { return _lsStore.size; },
  key: (n: number) => [..._lsStore.keys()][n] ?? null,
};
Object.defineProperty(window, "localStorage", { value: mockLocalStorage, writable: true });

// Reset localStorage between every test so state never bleeds across test cases.
beforeEach(() => {
  _lsStore.clear();
});

// Mock window.matchMedia (used by theme context and various components)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.scrollTo (used by feed and navigation)
Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: vi.fn(),
});
