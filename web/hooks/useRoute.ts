import { useState, useEffect } from "react";

// This is a pushState-based SPA with its own scroll-restore logic (see
// ShoutFeed's save/restore effects). Left at the browser default ("auto"),
// Chrome/Firefox ALSO try to restore scroll natively on every popstate —
// including from history.back() — racing our JS on its own timing and
// sometimes overriding it after the fact. Setting this once, at module load
// (before the app ever renders), hands scroll restoration entirely to our
// own code. Module-level, not inside a component/effect, since it must run
// before the very first paint, and is a one-time global setting.
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

type Route =
  | { page: "feed" }
  | { page: "profile"; userId: string }
  | { page: "shout"; shoutId: string; commentId?: string };

function parsePath(): Route {
  const path = window.location.pathname;

  // /profile/<userId>
  const profileMatch = path.match(/^\/profile\/([a-zA-Z0-9-]+)$/);
  if (profileMatch) {
    return { page: "profile", userId: profileMatch[1] };
  }

  // /shout/<shoutId> with optional ?comment=<commentId>
  const shoutMatch = path.match(/^\/shout\/([a-zA-Z0-9-]+)$/);
  if (shoutMatch) {
    const route: Route = { page: "shout", shoutId: shoutMatch[1] };
    const commentId = new URLSearchParams(window.location.search).get("comment");
    if (commentId) route.commentId = commentId;
    return route;
  }

  return { page: "feed" };
}

// Backward compatibility: redirect old hash-based URLs to clean paths
function migrateHashUrl() {
  const hash = window.location.hash;
  if (hash.startsWith("#/")) {
    const cleanPath = hash.slice(1); // "#/profile/123" → "/profile/123"
    history.replaceState(null, "", cleanPath);
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => {
    migrateHashUrl();
    return parsePath();
  });

  useEffect(() => {
    const onPopState = () => {
      const next = parsePath();
      console.log("[Router] Navigation:", window.location.pathname, "→", next);
      setRoute(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return route;
}

export function navigateTo(path: string) {
  history.pushState({ inApp: true }, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Goes back to the previous in-app entry when one exists (the current entry
// was itself reached via navigateTo, so there's guaranteed to be something
// behind it), falling back to the feed for direct/external entries — e.g. a
// shared permalink opened in a fresh tab, where history.back() would leave
// the app entirely rather than land anywhere useful.
export function goBack() {
  const inApp = (window.history.state as { inApp?: boolean } | null)?.inApp;
  if (inApp) {
    history.back();
  } else {
    navigateTo("/");
  }
}
