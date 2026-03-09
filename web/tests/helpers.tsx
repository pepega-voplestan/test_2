import { render, type RenderOptions } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { AuthProvider } from "../context/AuthContext";
import { SSEProvider } from "../context/SSEContext";
import { NotificationsProvider } from "../context/NotificationsContext";
import { type ReactElement } from "react";

/**
 * Renders a component wrapped in all app providers (Theme → Auth → Notifications).
 * Use this for integration-style tests where components depend on context.
 *
 * Note: AuthProvider fetches /api/v1/me on mount — mock `fetch` in your tests
 * or use vi.mock to stub the context if you don't need real auth behavior.
 */
function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ThemeProvider>
        <AuthProvider>
          <SSEProvider>
            <NotificationsProvider>{children}</NotificationsProvider>
          </SSEProvider>
        </AuthProvider>
      </ThemeProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

export { renderWithProviders };
export { render, screen, waitFor, within, act } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
