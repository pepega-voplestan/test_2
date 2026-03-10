import { createContext, useContext, useCallback, useEffect, useMemo, useState, ReactNode } from "react";
import { useAuth } from "./AuthContext";

type IgnoredUsersContextType = {
  ignoredUserIds: string[];
  isIgnored: (userId: string) => boolean;
  addIgnoredUser: (userId: string) => Promise<void>;
  removeIgnoredUser: (userId: string) => Promise<void>;
  refreshIgnoredUsers: () => Promise<void>;
};

const IgnoredUsersContext = createContext<IgnoredUsersContextType | undefined>(undefined);

export function IgnoredUsersProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ignoredUserIds, setIgnoredUserIds] = useState<string[]>([]);

  const refreshIgnoredUsers = useCallback(async () => {
    if (!user) {
      setIgnoredUserIds([]);
      return;
    }
    try {
      const res = await fetch("/api/v1/me/ignored-users", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setIgnoredUserIds(data.userIds || []);
    } catch {
      // silently fail
    }
  }, [user]);

  useEffect(() => {
    refreshIgnoredUsers();
  }, [refreshIgnoredUsers]);

  const isIgnored = useCallback(
    (userId: string) => ignoredUserIds.includes(userId),
    [ignoredUserIds]
  );

  const addIgnoredUser = useCallback(async (userId: string) => {
    const res = await fetch(`/api/v1/users/${userId}/ignore`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Ошибка");
    }
    await refreshIgnoredUsers();
  }, [refreshIgnoredUsers]);

  const removeIgnoredUser = useCallback(async (userId: string) => {
    const res = await fetch(`/api/v1/users/${userId}/ignore`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Ошибка");
    }
    await refreshIgnoredUsers();
  }, [refreshIgnoredUsers]);

  const value = useMemo<IgnoredUsersContextType>(
    () => ({
      ignoredUserIds,
      isIgnored,
      addIgnoredUser,
      removeIgnoredUser,
      refreshIgnoredUsers,
    }),
    [ignoredUserIds, isIgnored, addIgnoredUser, removeIgnoredUser, refreshIgnoredUsers]
  );

  return (
    <IgnoredUsersContext.Provider value={value}>{children}</IgnoredUsersContext.Provider>
  );
}

export function useIgnoredUsers() {
  const ctx = useContext(IgnoredUsersContext);
  if (!ctx) throw new Error("useIgnoredUsers must be used within <IgnoredUsersProvider>");
  return ctx;
}
