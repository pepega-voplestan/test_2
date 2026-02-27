import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "./AuthContext";

export interface ContentPreferences {
  showMedia: boolean;
  showNsfw: boolean;
  showPolitics: boolean;
}

interface ContentPreferencesContextType {
  prefs: ContentPreferences;
  setShowMedia: (v: boolean) => void;
  setShowNsfw: (v: boolean) => void;
  setShowPolitics: (v: boolean) => void;
}

const STORAGE_KEY = "content_preferences";

const DEFAULTS: ContentPreferences = {
  showMedia: true,
  showNsfw: false,
  showPolitics: false,
};

function loadLocalPrefs(): ContentPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        showMedia: typeof parsed.showMedia === "boolean" ? parsed.showMedia : DEFAULTS.showMedia,
        showNsfw: typeof parsed.showNsfw === "boolean" ? parsed.showNsfw : DEFAULTS.showNsfw,
        showPolitics: typeof parsed.showPolitics === "boolean" ? parsed.showPolitics : DEFAULTS.showPolitics,
      };
    }
  } catch {}
  return { ...DEFAULTS };
}

const ContentPreferencesContext = createContext<ContentPreferencesContextType | undefined>(undefined);

export function ContentPreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ContentPreferences>(loadLocalPrefs);

  // Sync server prefs when user logs in/out
  useEffect(() => {
    if (user) {
      setPrefs((prev) => ({
        showMedia: prev.showMedia,
        showNsfw: typeof user.showNsfw === "boolean" ? user.showNsfw : DEFAULTS.showNsfw,
        showPolitics: typeof user.showPolitics === "boolean" ? user.showPolitics : DEFAULTS.showPolitics,
      }));
    } else {
      // Logged out — revert to localStorage defaults
      setPrefs(loadLocalPrefs());
    }
  }, [user?.id, user?.showNsfw, user?.showPolitics]);

  // Persist showMedia to localStorage (it stays client-side only)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ showMedia: prefs.showMedia }));
    } catch {}
  }, [prefs.showMedia]);

  const setShowMedia = (v: boolean) => setPrefs((p) => ({ ...p, showMedia: v }));
  const setShowNsfw = (v: boolean) => setPrefs((p) => ({ ...p, showNsfw: v }));
  const setShowPolitics = (v: boolean) => setPrefs((p) => ({ ...p, showPolitics: v }));

  return (
    <ContentPreferencesContext.Provider value={{ prefs, setShowMedia, setShowNsfw, setShowPolitics }}>
      {children}
    </ContentPreferencesContext.Provider>
  );
}

export function useContentPreferences() {
  const ctx = useContext(ContentPreferencesContext);
  if (!ctx) throw new Error("useContentPreferences must be used within <ContentPreferencesProvider>");
  return ctx;
}
