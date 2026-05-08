"use client";

import type { PopupButton } from "@/lib/popups/types";

type PopupPreviewProps = {
  title: string | null;
  body: string | null;
  imageUrl: string | null;
  buttons: PopupButton[];
};

export function PopupPreview({
  title,
  body,
  imageUrl,
  buttons,
}: PopupPreviewProps) {
  const empty = !title && !body && !imageUrl && buttons.length === 0;

  return (
    <div className="rounded-2xl border border-dashed border-bordo-800/20 bg-neutral-50 p-6">
      <p className="mb-4 text-xs uppercase tracking-wide text-neutral-500">
        Vista previa
      </p>
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-bordo-800/10 bg-white shadow-xl">
        {imageUrl ? (
          <div className="relative aspect-[16/9] w-full bg-neutral-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={title ?? ""}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-4 p-6">
          {title ? (
            <h3 className="font-display text-xl font-bold leading-tight text-bordo-800">
              {title}
            </h3>
          ) : (
            <div className="h-5 w-2/3 rounded bg-neutral-200" />
          )}
          {body ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">
              {body}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-neutral-200" />
              <div className="h-3 w-5/6 rounded bg-neutral-200" />
              <div className="h-3 w-3/5 rounded bg-neutral-200" />
            </div>
          )}
          {buttons.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {buttons.map((b, i) => {
                const cls =
                  i === 0
                    ? "bg-bordo-800 text-white"
                    : "border border-bordo-800/20 bg-white text-bordo-800";
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium ${cls}`}
                  >
                    {b.label || "Botón"}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {empty && (
        <p className="mt-4 text-center text-xs text-neutral-500">
          Completá los campos para ver una previsualización en vivo.
        </p>
      )}
    </div>
  );
}
