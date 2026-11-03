import * as React from "react";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: string;
  message: string;
  tone: "neutral" | "success" | "error";
  action?: ToastAction;
}

interface ToastApi {
  show: (message: string, opts?: { tone?: ToastItem["tone"]; action?: ToastAction; durationMs?: number }) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const show = React.useCallback<ToastApi["show"]>((message, opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    const item: ToastItem = { id, message, tone: opts.tone ?? "neutral", action: opts.action };
    setItems((prev) => [...prev, item]);
    const duration = opts.durationMs ?? (opts.action ? 6000 : 3500);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`}>
            <span>{t.message}</span>
            {t.action && (
              <button
                className="toast__action"
                onClick={() => {
                  t.action!.onClick();
                  setItems((prev) => prev.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
