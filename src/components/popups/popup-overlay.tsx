"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { springSmooth } from "@/lib/motion";
import type { PopupRow, PopupButton } from "@/lib/popups/types";

const SHOW_DELAY_MS = 400;

function isInternal(url: string) {
  return url.startsWith("/");
}

function isMailto(url: string) {
  return url.startsWith("mailto:");
}

function PopupButtonEl({
  button,
  primary,
  onClose,
}: {
  button: PopupButton;
  primary: boolean;
  onClose: () => void;
}) {
  const cls = [
    "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
    primary
      ? "bg-bordo-800 text-white hover:bg-bordo-700"
      : "border border-bordo-800/20 bg-white text-bordo-800 hover:border-bordo-800 hover:bg-bordo-50",
  ].join(" ");

  if (isInternal(button.url)) {
    return (
      <Link href={button.url} className={cls} onClick={onClose}>
        {button.label}
      </Link>
    );
  }
  return (
    <a
      href={button.url}
      target={isMailto(button.url) ? undefined : "_blank"}
      rel={isMailto(button.url) ? undefined : "noopener noreferrer"}
      className={cls}
      onClick={onClose}
    >
      {button.label}
    </a>
  );
}

export function PopupOverlay({ popup }: { popup: PopupRow }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [popup.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="popup-backdrop"
          className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby={popup.title ? `popup-title-${popup.id}` : undefined}
        >
          <motion.div
            key="popup-card"
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-bordo-800/10 bg-white shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={springSmooth}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleClose}
              aria-label="Cerrar"
              className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-bordo-800 shadow-sm backdrop-blur transition-colors hover:bg-bordo-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>

            {popup.image_url && (
              <div className="relative aspect-[16/9] w-full bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={popup.image_url}
                  alt={popup.title ?? ""}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
            )}

            <div className="flex flex-col gap-5 p-7 md:p-8">
              {popup.title && (
                <h2
                  id={`popup-title-${popup.id}`}
                  className="font-display text-2xl font-bold leading-tight text-bordo-800"
                >
                  {popup.title}
                </h2>
              )}
              {popup.body && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">
                  {popup.body}
                </p>
              )}
              {popup.buttons.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {popup.buttons.map((b, i) => (
                    <PopupButtonEl
                      key={i}
                      button={b}
                      primary={i === 0}
                      onClose={handleClose}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
