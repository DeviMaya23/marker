import * as React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { RouterProvider } from "./lib/router";
import { ToastProvider } from "./lib/toast";
import { ConfirmProvider } from "./components/ConfirmDialog";

const rootEl = document.getElementById("root")!;
createRoot(rootEl).render(
  <React.StrictMode>
    <RouterProvider>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </RouterProvider>
  </React.StrictMode>,
);
