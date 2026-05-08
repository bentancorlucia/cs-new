"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PopupOverlay } from "./popup-overlay";
import type { PopupRow } from "@/lib/popups/types";

export function PopupMount() {
  const pathname = usePathname();
  const [popup, setPopup] = useState<PopupRow | null>(null);

  useEffect(() => {
    if (!pathname) return;
    let cancelled = false;

    fetch(`/api/popups/active?path=${encodeURIComponent(pathname)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { popup: null }))
      .then((data: { popup: PopupRow | null }) => {
        if (!cancelled) setPopup(data.popup);
      })
      .catch(() => {
        /* silently ignore */
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!popup) return null;
  return <PopupOverlay popup={popup} key={popup.id} />;
}
