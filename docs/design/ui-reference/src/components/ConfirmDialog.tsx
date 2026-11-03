import * as React from "react";
import { Modal } from "./Modal";

export interface ConfirmRequest {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** For a destructive action the user must type this exact phrase to confirm. */
  requireTypedPhrase?: string;
  onConfirm: () => void | Promise<void>;
}

interface ConfirmApi {
  confirm: (req: ConfirmRequest) => void;
}

const ConfirmContext = React.createContext<ConfirmApi | null>(null);

export function useConfirm(): ConfirmApi {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = React.useState<ConfirmRequest | null>(null);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const confirm = React.useCallback((req: ConfirmRequest) => {
    setRequest(req);
    setTyped("");
  }, []);

  const close = () => {
    if (!busy) {
      setRequest(null);
      setTyped("");
    }
  };

  const canConfirm = !request?.requireTypedPhrase || typed === request.requireTypedPhrase;

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {request && (
        <Modal
          open
          onClose={close}
          title={request.title}
          description={typeof request.description === "string" ? request.description : undefined}
          footer={
            <>
              <button className="btn btn--ghost" onClick={close} disabled={busy}>
                {request.cancelLabel ?? "Cancel"}
              </button>
              <button
                className={`btn ${request.tone === "danger" ? "btn--danger" : "btn--primary"}`}
                disabled={!canConfirm || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request.onConfirm();
                    setRequest(null);
                    setTyped("");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Working…" : request.confirmLabel ?? "Confirm"}
              </button>
            </>
          }
        >
          {typeof request.description !== "string" && request.description}
          {request.requireTypedPhrase && (
            <div className="field" style={{ marginTop: "var(--space-3)" }}>
              <label className="field__label">
                Type <strong>{request.requireTypedPhrase}</strong> to confirm
              </label>
              <input
                className="input"
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
          )}
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
