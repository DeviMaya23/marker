import * as React from "react";
import { FiLogOut, FiTrash2, FiBookmark } from "react-icons/fi";
import { AppShell } from "../components/AppShell";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../lib/toast";
import { useQuery } from "../lib/hooks";
import { listFolders, logout, deleteAccount, __debugFillToCap, __debugResetData, __debugSetNextError } from "../lib/api/client";
import { navigate } from "../lib/router";
import type { Problem } from "../lib/api/types";

function bookmarkletHref(): string {
  // See DECISIONS.md, "Bookmarklet origin": this reads location.origin so the
  // dragged link always targets wherever this app is actually deployed.
  const code = `(function(){var u=encodeURIComponent(location.href),t=encodeURIComponent(document.title);window.open(location.origin+'/#/save?url='+u+'&title='+t,'save-bookmark','width=480,height=420');})();`;
  return `javascript:${code}`;
}

export function AccountPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const foldersQuery = useQuery(["folders"], listFolders);

  function handleLogout() {
    confirm.confirm({
      title: "Log out?",
      description: "This ends your session here and signs you out of the identity provider too.",
      confirmLabel: "Log out",
      onConfirm: async () => {
        await logout();
        navigate("/login");
      },
    });
  }

  function handleDeleteAccount() {
    confirm.confirm({
      title: "Delete your account?",
      tone: "danger",
      confirmLabel: "Permanently delete my account",
      requireTypedPhrase: "delete my account",
      description: (
        <p>
          This permanently erases every bookmark, folder, note and trashed item you have here. There are no
          backups. Your identity-provider login is not affected, so you could sign up again, but none of this
          data would come back.
        </p>
      ),
      onConfirm: async () => {
        await deleteAccount();
        navigate("/login");
      },
    });
  }

  return (
    <AppShell
      folders={foldersQuery.data?.items ?? []}
      route="/account"
      onCreateFolder={() => {}}
      onRenameFolder={() => {}}
      onMoveFolder={() => {}}
      onDeleteFolder={() => {}}
      onLogout={handleLogout}
      topBar={<div className="library-topbar"><h1 className="library-topbar__title">Account &amp; help</h1></div>}
    >
      <div className="account-page">
        <section className="account-section">
          <h2 className="account-section__title">Session</h2>
          <p className="account-section__desc">Logging out ends this app's session and your identity provider session, so you'll need to sign in again next time.</p>
          <button className="btn btn--secondary" onClick={handleLogout}>
            <FiLogOut size={14} /> Log out
          </button>
        </section>

        <section className="account-section">
          <h2 className="account-section__title">Install the bookmarklet</h2>
          <p className="account-section__desc">
            Drag this link to your browser's bookmarks bar. Click it on any page to save that page here — a small
            window opens where you can confirm the title and folder before it's saved (nothing is saved just by
            opening it).
          </p>
          <a className="bookmarklet-link" href={bookmarkletHref()} onClick={(e) => e.preventDefault()}>
            <FiBookmark size={14} /> Save to Bookmarks
          </a>
          <ol className="account-section__steps">
            <li><strong>Chrome:</strong> show the bookmarks bar (Ctrl/Cmd+Shift+B), then drag the link above onto it.</li>
            <li><strong>Firefox:</strong> show the bookmarks toolbar, then drag the link above onto it.</li>
            <li><strong>Opera:</strong> open the bookmarks bar from the menu, then drag the link above onto it.</li>
            <li><strong>Safari (best-effort):</strong> show the Favorites bar, then drag the link above onto it. If dragging doesn't work, add any bookmark and edit its address to match this link.</li>
          </ol>
        </section>

        <section className="account-section account-section--danger">
          <h2 className="account-section__title">Delete account</h2>
          <p className="account-section__desc">
            Permanently erases all of your bookmarks, notes, folders and trash. There are no backups. Your
            identity-provider account itself is not deleted.
          </p>
          <button className="btn btn--danger" onClick={handleDeleteAccount}>
            <FiTrash2 size={14} /> Delete account
          </button>
        </section>

        <DemoControlsSection />
      </div>
    </AppShell>
  );
}

function DemoControlsSection() {
  const toast = useToast();
  const errorOptions: Array<{ code: Problem["code"]; label: string }> = [
    { code: "rate_limited", label: "Rate limited (429)" },
    { code: "bookmark_limit_reached", label: "Bookmark limit reached (409)" },
    { code: "validation_error", label: "Validation error (422)" },
  ];
  return (
    <section className="account-section account-section--demo">
      <h2 className="account-section__title">Demo data controls</h2>
      <p className="account-section__desc">
        This build runs against an in-memory mock instead of the real Go/Postgres backend (see DECISIONS.md), so a
        few states are easiest to reach with a deliberate nudge rather than by waiting on chance. These controls
        aren't part of the designed product — they won't exist once this is wired to the real API.
      </p>
      <div className="demo-controls__row">
        <span>Make the next write fail with:</span>
        {errorOptions.map((opt) => (
          <button
            key={opt.code}
            className="btn btn--ghost btn--sm"
            onClick={() => {
              __debugSetNextError(opt.code);
              toast.show(`Next save/edit/move will return ${opt.code}.`);
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="demo-controls__row">
        <button
          className="btn btn--ghost btn--sm"
          onClick={async () => {
            await __debugFillToCap();
            toast.show("Filled to the 1,000 bookmark cap.");
          }}
        >
          Fill to 1,000 bookmarks
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => {
            __debugResetData();
            toast.show("Demo data reset.");
            location.reload();
          }}
        >
          Reset demo data
        </button>
      </div>
    </section>
  );
}
