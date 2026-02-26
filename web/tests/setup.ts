import "@testing-library/jest-dom/vitest";

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
