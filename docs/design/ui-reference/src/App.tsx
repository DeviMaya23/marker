import * as React from "react";
import { useRoute, matchPath, navigate } from "./lib/router";
import { isLoggedIn } from "./lib/api/client";
import { LoginPage } from "./pages/LoginPage";
import { LibraryPage } from "./pages/LibraryPage";
import { TrashPage } from "./pages/TrashPage";
import { BookmarkDetailPage } from "./pages/BookmarkDetailPage";
import { AccountPage } from "./pages/AccountPage";
import { SavePopupPage } from "./pages/SavePopupPage";

function useAuthGate(path: string): "checking" | "ok" {
  const [state, setState] = React.useState<"checking" | "ok">("checking");
  React.useEffect(() => {
    let mounted = true;
    isLoggedIn().then((ok) => {
      if (!mounted) return;
      if (!ok) {
        navigate("/login", { return_to: path });
      } else {
        setState("ok");
      }
    });
    return () => {
      mounted = false;
    };
  }, [path]);
  return state;
}

function AuthenticatedRoute({ path, children }: { path: string; children: React.ReactNode }) {
  const state = useAuthGate(path);
  if (state === "checking") return <div className="full-page-loading">Loading…</div>;
  return <>{children}</>;
}

export function App() {
  const route = useRoute();
  const { path, params } = route;

  // The save popup manages its own auth check (FR-3c: return to the *same*
  // popup + params after login) and renders without the app chrome, since
  // it's opened as its own small window.
  if (path === "/save") {
    const url = params.get("url") ?? "";
    const title = params.get("title") ?? undefined;
    // Keyed so navigating to a different /save?url=... (as happens when this
    // story is driven from one browser tab) resets the form; in real use each
    // bookmarklet click opens a brand-new popup window, which remounts anyway.
    return <SavePopupPage key={`${url}|${title ?? ""}`} url={url} title={title} />;
  }

  if (path === "/login" || path === "/") {
    return <LoginPage returnTo={params.get("return_to") ?? undefined} />;
  }

  if (path === "/all") {
    return (
      <AuthenticatedRoute path={path}>
        <LibraryPage route="/all" />
      </AuthenticatedRoute>
    );
  }

  const folderMatch = matchPath("/folder/:id", path);
  if (folderMatch) {
    return (
      <AuthenticatedRoute path={path}>
        <LibraryPage route="/folder" folderId={folderMatch.id} />
      </AuthenticatedRoute>
    );
  }

  if (path === "/trash") {
    return (
      <AuthenticatedRoute path={path}>
        <TrashPage />
      </AuthenticatedRoute>
    );
  }

  const bookmarkMatch = matchPath("/bookmarks/:id", path);
  if (bookmarkMatch) {
    return (
      <AuthenticatedRoute path={path}>
        <BookmarkDetailPage id={bookmarkMatch.id} />
      </AuthenticatedRoute>
    );
  }

  if (path === "/account") {
    return (
      <AuthenticatedRoute path={path}>
        <AccountPage />
      </AuthenticatedRoute>
    );
  }

  return (
    <AuthenticatedRoute path={path}>
      <LibraryPage route="/all" />
    </AuthenticatedRoute>
  );
}
