// A minimal hash-based router. There's no react-router in this build (see
// DECISIONS.md, "Routing"); the app only has a handful of routes and the save
// popup is opened in its own small window via window.open, so hash routing
// (no server-side rewrite rules needed, works from a static file server) is
// the simplest fit.
import * as React from "react";

export interface RouteMatch {
  path: string;
  params: URLSearchParams;
}

function parseHash(): RouteMatch {
  const hash = window.location.hash.replace(/^#/, "") || "/";
  const [path, query] = hash.split("?");
  return { path: path || "/", params: new URLSearchParams(query ?? "") };
}

const RouterContext = React.createContext<RouteMatch>(parseHash());

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [match, setMatch] = React.useState<RouteMatch>(() => parseHash());
  React.useEffect(() => {
    const onHashChange = () => setMatch(parseHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return <RouterContext.Provider value={match}>{children}</RouterContext.Provider>;
}

export function useRoute(): RouteMatch {
  return React.useContext(RouterContext);
}

export function navigate(path: string, params?: Record<string, string | undefined>) {
  const qs = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
        .join("&")
    : "";
  window.location.hash = qs ? `${path}?${qs}` : path;
}

export function Link({
  to,
  params,
  className,
  children,
  onClick,
}: {
  to: string;
  params?: Record<string, string | undefined>;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const qs = params
    ? "?" +
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
        .join("&")
    : "";
  return (
    <a
      href={`#${to}${qs}`}
      className={className}
      onClick={(e) => {
        onClick?.();
      }}
    >
      {children}
    </a>
  );
}

/** Matches a path against a pattern like "/bookmarks/:id" and returns params, or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pParts = pattern.split("/").filter(Boolean);
  const aParts = path.split("/").filter(Boolean);
  if (pParts.length !== aParts.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(":")) {
      out[pParts[i].slice(1)] = decodeURIComponent(aParts[i]);
    } else if (pParts[i] !== aParts[i]) {
      return null;
    }
  }
  return out;
}
