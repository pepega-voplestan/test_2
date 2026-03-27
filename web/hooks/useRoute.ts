import { useState, useEffect } from "react";

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
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
