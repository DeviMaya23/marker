import * as React from "react";
import { FiBookmark } from "react-icons/fi";
import { login } from "../lib/api/client";
import { navigate } from "../lib/router";

export function LoginPage({ returnTo }: { returnTo?: string }) {
  const [loading, setLoading] = React.useState(false);

  async function handleLogin() {
    setLoading(true);
    // Stands in for a redirect to the identity provider's hosted login page
    // (FR-1) and back to /auth/callback. No sign-up or password form is drawn
    // here on purpose -- that's the IdP's screen, not this app's.
    await login();
    navigate(returnTo || "/all");
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__brand">
          <FiBookmark size={28} />
        </div>
        <h1 className="login-card__title">Bookmarks</h1>
        <p className="login-card__desc">A place to dump links and find them again.</p>
        <button className="btn btn--primary btn--block" onClick={handleLogin} disabled={loading}>
          {loading ? "Redirecting…" : "Log in"}
        </button>
        <p className="login-card__fineprint">
          You'll continue to your identity provider to sign in with email and password, or SSO.
        </p>
      </div>
    </div>
  );
}
