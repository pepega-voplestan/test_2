import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

export type User = {
  id: string;
  name: string;
  avatar: string;
  showNsfw?: boolean;
  showPolitics?: boolean;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;

  login: (login: string, password: string) => Promise<void>;
  registerSendCode: (username: string, password: string, email: string) => Promise<void>;
  registerVerify: (email: string, code: string) => Promise<void>;
  forgotPasswordSendCode: (email: string) => Promise<void>;
  forgotPasswordReset: (email: string, code: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;

  isAuthModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let msg = "Что-то пошло не так";
    try {
      const data = await res.json();
      msg = data?.error || msg;
    } catch {}
    throw new Error(msg);
  }

  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const openModal = () => setIsAuthModalOpen(true);
  const closeModal = () => setIsAuthModalOpen(false);

  async function refresh() {
    console.log("[Auth] Refreshing session...");
    try {
      const data = await api<{ user: User | null }>("/api/v1/me");
      setUser(data.user);
      console.log(`[Auth] Session: ${data.user ? data.user.name : "not logged in"}`);
    } catch (err) {
      console.error("[Auth] Session refresh failed:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(loginValue: string, password: string) {
    console.log(`[Auth] Logging in as "${loginValue}"...`);
    const data = await api<{ user: User }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ login: loginValue, password }),
    });
    console.log(`[Auth] Login successful: ${data.user.name}`);
    setUser(data.user);
    closeModal();
  }

  async function registerSendCode(username: string, password: string, email: string) {
    console.log(`[Auth] Sending registration code for "${username}" to ${email}...`);
    await api<{ ok: boolean }>("/api/v1/auth/register/send-code", {
      method: "POST",
      body: JSON.stringify({ username, password, email }),
    });
    console.log(`[Auth] Registration code sent to ${email}`);
  }

  async function registerVerify(email: string, code: string) {
    console.log(`[Auth] Verifying registration code for ${email}...`);
    const data = await api<{ user: User }>("/api/v1/auth/register/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
    console.log(`[Auth] Registration successful: ${data.user.name}`);
    setUser(data.user);
    closeModal();
  }

  async function forgotPasswordSendCode(email: string) {
    console.log(`[Auth] Sending password reset code to ${email}...`);
    await api<{ ok: boolean }>("/api/v1/auth/forgot-password/send-code", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    console.log(`[Auth] Password reset code sent to ${email}`);
  }

  async function forgotPasswordReset(email: string, code: string, newPassword: string) {
    console.log(`[Auth] Resetting password for ${email}...`);
    const data = await api<{ user: User }>("/api/v1/auth/forgot-password/reset", {
      method: "POST",
      body: JSON.stringify({ email, code, newPassword }),
    });
    console.log(`[Auth] Password reset successful, logged in as ${data.user.name}`);
    setUser(data.user);
    closeModal();
  }

  async function logout() {
    console.log("[Auth] Logging out...");
    await api("/api/v1/auth/logout", { method: "POST" });
    console.log("[Auth] Logged out");
    setUser(null);
  }

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      loading,
      login,
      registerSendCode,
      registerVerify,
      forgotPasswordSendCode,
      forgotPasswordReset,
      logout,
      refresh,
      isAuthModalOpen,
      openModal,
      closeModal,
    }),
    [user, loading, isAuthModalOpen]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
