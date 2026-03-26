import { useState, useEffect } from "react";

type Route =
  | { page: "feed" }
  | { page: "profile"; userId: string }
  | { page: "shout"; shoutId: string; commentId?: string };

function parseHash(): Route {
  const hash = window.location.hash;

  // #/profile/<userId>
  const profileMatch = hash.match(/^#\/profile\/([a-zA-Z0-9-]+)$/);
  if (profileMatch) {
    return { page: "profile", userId: profileMatch[1] };
  }

  // #/shout/<shoutId> or #/shout/<shoutId>?comment=<commentId>
  const shoutMatch = hash.match(/^#\/shout\/([a-zA-Z0-9-]+)(?:\?comment=([a-zA-Z0-9-]+))?$/);
  if (shoutMatch) {
    const route: Route = { page: "shout", shoutId: shoutMatch[1] };
    if (shoutMatch[2]) route.commentId = shoutMatch[2];
    return route;
  }

  return { page: "feed" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHashChange = () => {
      const next = parseHash();
      console.log("[Router] Hash changed:", window.location.hash, "→", next);
      setRoute(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}

export function navigateTo(path: string) {
  window.location.hash = path;
}
