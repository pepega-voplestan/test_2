import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

type Mode = "login" | "register";

export default function AuthModal() {
  const { isAuthModalOpen, closeModal, login, register } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(
    () => (mode === "login" ? "Вход" : "Регистрация"),
    [mode]
  );

  if (!isAuthModalOpen) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const u = username.trim();
      if (u.length < 3) throw new Error("Username минимум 3 символа");
      if (password.length < 6) throw new Error("Пароль минимум 6 символов");

      if (mode === "login") await login(u, password);
      else await register(u, password);

      setPassword("");
    } catch (err: any) {
      setError(err?.message || "Что-то пошло не так");
    } finally {
      setSubmitting(false);
    }
  }

  function onClose() {
    setError(null);
    closeModal();
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-zinc-900 text-zinc-100 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="text-lg font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        <div className="px-5">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); }}
              className={[
                "rounded-lg px-3 py-2 text-sm transition",
                mode === "login"
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(null); }}
              className={[
                "rounded-lg px-3 py-2 text-sm transition",
                mode === "register"
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:text-zinc-200",
              ].join(" ")}
            >
              Регистрация
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="px-5 pb-5 pt-4">
          {error && (
            <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-400">
              Username
            </div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full rounded-xl bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-2 focus:ring-white/20"
              placeholder="например: maksim"
              disabled={submitting}
            />
          </label>

          <label className="mt-3 block">
            <div className="mb-1 text-xs font-medium text-zinc-400">
              Пароль
            </div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full rounded-xl bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-2 focus:ring-white/20"
              placeholder="••••••••"
              disabled={submitting}
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Подожди..."
              : mode === "login"
              ? "Войти"
              : "Создать аккаунт"}
          </button>

          <div className="mt-3 text-center text-xs text-zinc-500">
            {mode === "login" ? (
              <>
                Нет аккаунта?{" "}
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className="text-zinc-200 hover:underline"
                >
                  Зарегистрироваться
                </button>
              </>
            ) : (
              <>
                Уже есть аккаунт?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-zinc-200 hover:underline"
                >
                  Войти
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
