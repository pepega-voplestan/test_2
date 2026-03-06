import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

beforeEach(() => {
  localStorage.removeItem("theme");
  // Ensure the html element starts clean
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("ThemeContext — initial theme", () => {
  it("defaults to dark when localStorage has no theme", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
  });

  it("reads 'dark' from localStorage", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
  });

  it("reads 'light' from localStorage", () => {
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
  });

  it("falls back to dark for an unrecognised localStorage value", () => {
    localStorage.setItem("theme", "solarized");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
  });
});

describe("ThemeContext — toggle", () => {
  it("switches from dark to light", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");

    act(() => result.current.toggle());
    expect(result.current.theme).toBe("light");
  });

  it("switches from light to dark", () => {
    localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");
  });

  it("toggles back to original after two clicks", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe("dark");
  });
});

describe("ThemeContext — DOM side effects", () => {
  it("adds 'dark' class to document.documentElement when theme is dark", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes 'dark' class when theme switches to light", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.toggle()); // dark → light
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists chosen theme to localStorage", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.toggle()); // dark → light
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("updates localStorage again on second toggle", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.toggle()); // dark → light
    act(() => result.current.toggle()); // light → dark
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});

describe("ThemeContext — guard", () => {
  it("throws when useTheme is called outside ThemeProvider", () => {
    expect(() => renderHook(() => useTheme())).toThrow(
      "useTheme must be used within"
    );
  });
});
