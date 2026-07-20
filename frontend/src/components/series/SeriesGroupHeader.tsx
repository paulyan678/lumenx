"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

type SeriesGroupHeaderProps = {
  title: string;
  episodeCount: number;
  deleting?: boolean;
  onOpen: () => void;
  onDelete: () => void;
};

export default function SeriesGroupHeader({
  title,
  episodeCount,
  deleting = false,
  onOpen,
  onDelete,
}: SeriesGroupHeaderProps) {
  const t = useTranslations("workspace");
  const tc = useTranslations("common");

  return (
    <div className="flex items-center gap-3 mt-4 mb-4 mx-0.5">
      <button
        type="button"
        onClick={onOpen}
        className="font-display atelier-display text-[1.5rem] font-semibold tracking-tight text-foreground hover:text-primary transition-colors"
      >
        {title}
      </button>
      <span className="font-mono text-[0.625rem] uppercase tracking-wider text-text-muted">
        {t("series")} · {t("frames", { count: episodeCount })}
      </span>
      <span className="atelier-group-line h-px flex-1 bg-glass-border" />
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label={t("deleteSeriesAria", { title })}
        title={t("deleteSeriesAria", { title })}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-glass-border px-2.5 py-1.5 font-sans text-[0.75rem] font-medium text-text-secondary transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:border-red-500/40 focus-visible:text-red-400 disabled:cursor-wait disabled:opacity-60"
      >
        {deleting ? (
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 size={13} aria-hidden="true" />
        )}
        <span>{tc("delete")}</span>
      </button>
    </div>
  );
}
