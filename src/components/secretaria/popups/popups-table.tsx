"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Edit3, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PopupRow } from "@/lib/popups/types";
import { DeletePopupButton } from "./delete-popup-button";

type FilterKey = "todos" | "activos" | "proximos" | "pasados";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-UY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function isActive(p: PopupRow, now = new Date()) {
  return (
    p.status === "published" &&
    new Date(p.starts_at) <= now &&
    new Date(p.ends_at) >= now
  );
}

function isUpcoming(p: PopupRow, now = new Date()) {
  return new Date(p.starts_at) > now;
}

function isExpired(p: PopupRow, now = new Date()) {
  return new Date(p.ends_at) < now;
}

export function PopupsTable({ popups }: { popups: PopupRow[] }) {
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const now = new Date();
    const q = search.trim().toLowerCase();
    return popups.filter((p) => {
      if (filter === "activos" && !isActive(p, now)) return false;
      if (filter === "proximos" && !isUpcoming(p, now)) return false;
      if (filter === "pasados" && !isExpired(p, now)) return false;
      if (q) {
        const hay =
          (p.title ?? "").toLowerCase().includes(q) ||
          (p.body ?? "").toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [popups, filter, search]);

  const counts = useMemo(() => {
    const now = new Date();
    return {
      todos: popups.length,
      activos: popups.filter((p) => isActive(p, now)).length,
      proximos: popups.filter((p) => isUpcoming(p, now)).length,
      pasados: popups.filter((p) => isExpired(p, now)).length,
    };
  }, [popups]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "activos", label: "Activos" },
    { key: "proximos", label: "Próximos" },
    { key: "pasados", label: "Pasados" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input
            placeholder="Buscar por título o contenido…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-bordo-800 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {f.label}{" "}
              <span className="opacity-70">({counts[f.key]})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]"></TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Páginas</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead className="text-center">Prioridad</TableHead>
              <TableHead className="w-[120px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-neutral-500"
                >
                  Sin popups que coincidan.
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map((p, i) => {
                  const active = isActive(p);
                  const upcoming = isUpcoming(p);
                  const expired = isExpired(p);
                  return (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.03 }}
                      className="border-b border-neutral-100 last:border-0"
                    >
                        <TableCell>
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.image_url}
                              alt=""
                              className="h-10 w-16 rounded-md object-cover"
                            />
                          ) : (
                            <div className="h-10 w-16 rounded-md bg-neutral-100" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-neutral-900">
                              {p.title || (
                                <span className="text-neutral-400">
                                  (sin título)
                                </span>
                              )}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {active && (
                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                                  Activo ahora
                                </Badge>
                              )}
                              {p.status === "published" && !active && (
                                <Badge variant="outline">Publicado</Badge>
                              )}
                              {p.status === "draft" && (
                                <Badge variant="outline" className="text-neutral-500">
                                  Borrador
                                </Badge>
                              )}
                              {upcoming && (
                                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                                  Próximo
                                </Badge>
                              )}
                              {expired && (
                                <Badge variant="outline" className="text-neutral-400">
                                  Expirado
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[260px]">
                            {p.pages.slice(0, 4).map((pg) => (
                              <code
                                key={pg}
                                className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-700"
                              >
                                {pg}
                              </code>
                            ))}
                            {p.pages.length > 4 && (
                              <span className="text-[11px] text-neutral-500">
                                +{p.pages.length - 4}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-neutral-600">
                          {formatDate(p.starts_at)} → {formatDate(p.ends_at)}
                        </TableCell>
                        <TableCell className="text-center text-sm font-medium">
                          {p.priority}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Link href={`/secretaria/popups/${p.id}/edit`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-bordo-800 hover:bg-bordo-50"
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                            </Link>
                            <DeletePopupButton id={p.id} title={p.title} />
                          </div>
                        </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
