import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useScrollLock } from "../hooks/useScrollLock";

type Mode = "login" | "register" | "register-verify" | "forgot" | "forgot-verify" | "forgot-newpass";

const USERNAME_RE = /^[A-Za-zА-Яа-яЁё0-9\-_ ]+$/;

export default function AuthModal() {
  const {
    isAuthModalOpen,
    closeModal,
    login,
    registerSendCode,
    registerVerify,
    forgotPasswordSendCode,
    forgotPasswordReset,
  } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const isVerifyMode = mode === "register-verify" || mode === "forgot-verify";

  // Block ESC key during verify modes
  useEffect(() => {
    if (!isAuthModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isVerifyMode) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isAuthModalOpen, isVerifyMode]);

  const title = useMemo(() => {
    switch (mode) {
      case "login": return "Вход";
      case "register":
      case "register-verify": return "Регистрация";
      case "forgot":
      case "forgot-verify":
      case "forgot-newpass": return "Восстановление пароля";
    }
  }, [mode]);

  useScrollLock(isAuthModalOpen);

  if (!isAuthModalOpen) return null;

  function resetState() {
    setUsername("");
    setEmail("");
    setPassword("");
    setCode("");
    setNewPassword("");
    setError(null);
    setInfo(null);
    setShowPassword(false);
  }

  function switchMode(newMode: Mode) {
    resetState();
    setMode(newMode);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      switch (mode) {
        case "login": {
          const loginVal = username.trim();
          if (!loginVal) throw new Error("Введите имя пользователя или email");
          if (password.length < 1) throw new Error("Введите пароль");
          await login(loginVal, password);
          resetState();
          break;
        }

        case "register": {
          const u = username.trim();
          if (u.length < 3 || u.length > 32) throw new Error("Имя пользователя: от 3 до 32 символов");
          if (!USERNAME_RE.test(u)) throw new Error("Имя может содержать только буквы, цифры, дефис, подчёркивание и пробел");
          if (password.length < 6) throw new Error("Пароль: минимум 6 символов");
          const em = email.trim();
          if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))
            throw new Error("Введите корректный email");
          await registerSendCode(u, password, em);
          setEmail(em);
          setMode("register-verify");
          setInfo(`Код отправлен на ${em}`);
          break;
        }

        case "register-verify": {
          const c = code.trim();
          if (c.length !== 6) throw new Error("Введите 6-значный код из письма");
          await registerVerify(email, c);
          resetState();
          break;
        }

        case "forgot": {
          const em = email.trim();
          if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))
            throw new Error("Введите корректный email");
          await forgotPasswordSendCode(em);
          setEmail(em);
          setMode("forgot-verify");
          setInfo(`Если аккаунт с этим email существует, код отправлен на ${em}`);
          break;
        }

        case "forgot-verify": {
          const c = code.trim();
          if (c.length !== 6) throw new Error("Введите 6-значный код из письма");
          // Store code for the next step — don't verify yet, we need the new password
          setCode(c);
          setMode("forgot-newpass");
          setInfo(null);
          break;
        }

        case "forgot-newpass": {
          const np = newPassword;
          if (np.length < 6) throw new Error("Пароль: минимум 6 символов");
          await forgotPasswordReset(email, code, np);
          resetState();
          break;
        }
      }
    } catch (err: any) {
      setError(err?.message || "Что-то пошло не так");
    } finally {
      setSubmitting(false);
    }
  }

  function onClose() {
    resetState();
    setMode("login");
    closeModal();
  }

  const isLoginOrRegisterTab = mode === "login" || mode === "register";

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/60"
        onClick={isVerifyMode ? undefined : onClose}
        style={isVerifyMode ? { cursor: "default" } : undefined}
      />

      <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-th-card text-th-text shadow-2xl ring-1 ring-th-ring/10">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            {!isLoginOrRegisterTab && !isVerifyMode && (
              <button
                onClick={() => switchMode("login")}
                className="rounded-lg px-2 py-1 text-th-text-3 hover:bg-th-ring/10 hover:text-th-text-2"
                title="Назад"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
              </button>
            )}
            <div className="text-lg font-semibold">{title}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-th-text-3 hover:bg-th-ring/10 hover:text-th-text-2"
          >
            ✕
          </button>
        </div>

        {/* Tabs — only for login/register base modes */}
        {isLoginOrRegisterTab && (
          <div className="px-5">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-th-ring/5 p-1">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={[
                  "rounded-lg px-3 py-2 text-sm transition",
                  mode === "login"
                    ? "bg-th-ring/10 text-th-text"
                    : "text-th-text-3 hover:text-th-text-2",
                ].join(" ")}
              >
                Вход
              </button>
              <button
                type="button"
                onClick={() => switchMode("register")}
                className={[
                  "rounded-lg px-3 py-2 text-sm transition",
                  mode === "register"
                    ? "bg-th-ring/10 text-th-text"
                    : "text-th-text-3 hover:text-th-text-2",
                ].join(" ")}
              >
                Регистрация
              </button>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="px-5 pb-5 pt-4">
          {error && (
            <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 dark:text-red-200 text-red-700">
              {error}
            </div>
          )}

          {info && (
            <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-200">
              {info}
            </div>
          )}

          {/* ---- LOGIN form ---- */}
          {mode === "login" && (
            <>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-th-text-3">
                  Имя пользователя или email
                </div>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full rounded-xl bg-th-ring/5 px-3 py-2 text-base outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
                  placeholder="username или email"
                  disabled={submitting}
                />
              </label>

              <label className="mt-3 block">
                <div className="mb-1 text-xs font-medium text-th-text-3">
                  Пароль
                </div>
                <div className="relative">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="w-full rounded-xl bg-th-ring/5 px-3 py-2 pr-10 text-base outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
                    placeholder="••••••••"
                    disabled={submitting}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-th-text-4 hover:text-th-text-2 transition-colors" aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </label>

              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-xs text-th-text-3 hover:text-th-text-2 hover:underline"
                >
                  Забыли пароль?
                </button>
              </div>
            </>
          )}

          {/* ---- REGISTER form (step 1: collect info) ---- */}
          {mode === "register" && (
            <>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-th-text-3">
                  Имя пользователя
                </div>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full rounded-xl bg-th-ring/5 px-3 py-2 text-base outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
                  placeholder="например: maksim"
                  disabled={submitting}
                />
              </label>

              <label className="mt-3 block">
                <div className="mb-1 text-xs font-medium text-th-text-3">
                  Email
                </div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-xl bg-th-ring/5 px-3 py-2 text-base outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
                  placeholder="user@example.com"
                  disabled={submitting}
                />
              </label>

              <label className="mt-3 block">
                <div className="mb-1 text-xs font-medium text-th-text-3">
                  Пароль
                </div>
                <div className="relative">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className="w-full rounded-xl bg-th-ring/5 px-3 py-2 pr-10 text-base outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
                    placeholder="••••••••"
                    disabled={submitting}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-th-text-4 hover:text-th-text-2 transition-colors" aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </label>
            </>
          )}

          {/* ---- REGISTER verify (step 2: enter code) ---- */}
          {mode === "register-verify" && (
            <>
              <p className="mb-3 text-sm text-th-text-3">
                Введите 6-значный код, отправленный на <span className="text-th-text-2">{email}</span>
              </p>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-th-text-3">
                  Код подтверждения
                </div>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="w-full rounded-xl bg-th-ring/5 px-3 py-2 text-center text-lg font-mono tracking-[0.3em] outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
                  placeholder="000000"
                  maxLength={6}
                  disabled={submitting}
                  autoFocus
                />
              </label>
            </>
          )}

          {/* ---- FORGOT PASSWORD (step 1: enter email) ---- */}
          {mode === "forgot" && (
            <>
              <p className="mb-3 text-sm text-th-text-3">
                Введите email, указанный при регистрации. Мы отправим код для сброса пароля.
              </p>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-th-text-3">
                  Email
                </div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-xl bg-th-ring/5 px-3 py-2 text-base outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
                  placeholder="user@example.com"
                  disabled={submitting}
                  autoFocus
                />
              </label>
            </>
          )}

          {/* ---- FORGOT PASSWORD (step 2: enter code) ---- */}
          {mode === "forgot-verify" && (
            <>
              <p className="mb-3 text-sm text-th-text-3">
                Введите 6-значный код, отправленный на <span className="text-th-text-2">{email}</span>
              </p>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-th-text-3">
                  Код подтверждения
                </div>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="w-full rounded-xl bg-th-ring/5 px-3 py-2 text-center text-lg font-mono tracking-[0.3em] outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
                  placeholder="000000"
                  maxLength={6}
                  disabled={submitting}
                  autoFocus
                />
              </label>
            </>
          )}

          {/* ---- FORGOT PASSWORD (step 3: new password) ---- */}
          {mode === "forgot-newpass" && (
            <>
              <p className="mb-3 text-sm text-th-text-3">
                Введите новый пароль для вашего аккаунта.
              </p>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-th-text-3">
                  Новый пароль
                </div>
                <div className="relative">
                  <input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className="w-full rounded-xl bg-th-ring/5 px-3 py-2 pr-10 text-base outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
                    placeholder="••••••••"
                    disabled={submitting}
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-th-text-4 hover:text-th-text-2 transition-colors" aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </label>
            </>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-th-text px-3 py-2 text-sm font-semibold text-th-page hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 transition-opacity"
          >
            {submitting
              ? "Подожди..."
              : mode === "login"
              ? "Войти"
              : mode === "register"
              ? "Отправить код"
              : mode === "register-verify"
              ? "Подтвердить"
              : mode === "forgot"
              ? "Отправить код"
              : mode === "forgot-verify"
              ? "Далее"
              : "Сохранить пароль"}
          </button>

          {/* Footer links */}
          <div className="mt-3 text-center text-xs text-th-text-4">
            {mode === "login" && (
              <>
                Нет аккаунта?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="text-th-text-2 hover:underline"
                >
                  Зарегистрироваться
                </button>
              </>
            )}
            {mode === "register" && (
              <>
                Уже есть аккаунт?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="text-th-text-2 hover:underline"
                >
                  Войти
                </button>
              </>
            )}
            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="text-th-text-2 hover:underline"
              >
                Вернуться ко входу
              </button>
            )}
            {mode === "forgot-newpass" && (
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="text-th-text-2 hover:underline"
              >
                Вернуться ко входу
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
