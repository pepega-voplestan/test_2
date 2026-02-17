import { useState, useEffect } from "react";

type Route =
  | { page: "feed" }
  | { page: "profile"; userId: string };

function parseHash(): Route {
  const hash = window.location.hash;

  // #/profile/<userId>
  const profileMatch = hash.match(/^#\/profile\/([a-zA-Z0-9-]+)$/);
  if (profileMatch) {
    return { page: "profile", userId: profileMatch[1] };
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
