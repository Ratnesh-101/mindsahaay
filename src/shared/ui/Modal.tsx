import React, { useEffect, useRef } from "react";

interface ModalProps {
  isOpen?: boolean;
  onClose: () => void;
  title?: string;
  ariaLabel?: string;
  className?: string;
  cardStyle?: React.CSSProperties;
  children: React.ReactNode;
}

export default function Modal({
  isOpen = true,
  onClose,
  title,
  ariaLabel,
  className = "",
  cardStyle,
  children,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save previous active element to restore upon close
    const previousActiveElement = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Tab" && cardRef.current) {
        const focusableElements = cardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    const handleBackdropClick = (e: MouseEvent) => {
      if (backdropRef.current && e.target === backdropRef.current) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const backdropEl = backdropRef.current;
    if (backdropEl) {
      backdropEl.addEventListener("click", handleBackdropClick);
    }

    // Initial focus into modal
    const focusTimeout = setTimeout(() => {
      if (cardRef.current) {
        const firstFocusable = cardRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          cardRef.current.focus();
        }
      }
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (backdropEl) {
        backdropEl.removeEventListener("click", handleBackdropClick);
      }
      clearTimeout(focusTimeout);
      if (previousActiveElement && typeof previousActiveElement.focus === "function") {
        previousActiveElement.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div ref={backdropRef} className="modal-backdrop">
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || "Modal dialog"}
        tabIndex={-1}
        className={`modal-card ${className}`.trim()}
        style={cardStyle}
      >
        {children}
      </div>
    </div>
  );
}
