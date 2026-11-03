import * as React from "react";
import { Dialog, DialogPanel, DialogTitle, Description } from "@headlessui/react";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <Dialog open={open} onClose={onClose} className="modal-root">
      <div className="modal-overlay" aria-hidden="true" />
      <div className="modal-center">
        <DialogPanel className={`modal-panel modal-panel--${size}`}>
          <DialogTitle className="modal-title">{title}</DialogTitle>
          {description && <Description className="modal-description">{description}</Description>}
          {children && <div className="modal-body">{children}</div>}
          {footer && <div className="modal-footer">{footer}</div>}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
