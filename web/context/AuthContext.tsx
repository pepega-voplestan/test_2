import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

export type User = {
  id: string;
  name: string;
  avatar: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;

  login: (login: string, password: string) => Promise<void>;
  register: (username: string, password: string, email: string) => Promise<void>;
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

  async function register(username: string, password: string, email: string) {
    console.log(`[Auth] Registering "${username}"...`);
    const data = await api<{ user: User }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, email }),
    });
    console.log(`[Auth] Registration successful: ${data.user.name}`);
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
      register,
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
