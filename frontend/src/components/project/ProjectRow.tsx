"use client";

import { useEffect, useRef, useState } from "react";
import {
  Clock,
  ExternalLink,
  FileText,
  Film,
  Loader2,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { deriveCover, deriveStatus } from "@/components/project/ProjectCard";
import type { Project } from "@/store/projectStore";

interface ProjectRowProps {
  project: Project;
  crumb: string;
  onDelete: (id: string) => void | Promise<void>;
}

export default function ProjectRow({ project, crumb, onDelete }: ProjectRowProps) {
  const t = useTranslations("project");
  const tCommon = useTranslations("common");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  const cover = deriveCover(project);
  const status = deriveStatus(project);
  const frameCount = project.frames?.length || 0;
  const sceneCount = project.scenes?.length || 0;

  const open = () => {
    window.location.hash = project.series_id
      ? `#/series/${project.series_id}/episode/${project.id}`
      : `#/project/${project.id}`;
  };

  useEffect(() => {
    if (!menuOpen) return;
    firstItemRef.current?.focus();

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (
        menuWrapRef.current &&
        !menuWrapRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [menuOpen]);

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    setMenuOpen(false);
    if (
      isDeleting ||
      !window.confirm(t("confirmDelete", { title: project.title }))
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(project.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const badge = {
    completed: {
      label: t("statusCompleted"),
      cls: "text-status-completed-fg bg-status-completed-bg border-status-completed-border",
    },
    processing: {
      label: t("statusProcessing"),
      cls: "text-status-processing-fg bg-status-processing-bg border-status-processing-border",
    },
    pending: {
      label: t("statusDraft"),
      cls: "text-status-pending-fg bg-status-pending-bg border-status-pending-border",
    },
  }[status];

  return (
    <div
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          if (event.key === " ") event.preventDefault();
          open();
        }
      }}
      className={`group relative glass-panel flex items-center gap-4 rounded-xl border border-glass-border px-3 py-2.5 cursor-pointer hover:bg-hover-bg transition-colors ${menuOpen ? "z-50" : ""}`}
    >
      <div className="relative w-[68px] aspect-[16/10] flex-shrink-0 rounded-lg overflow-hidden bg-surface-inset">
        {cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-text-muted">
            <FileText size={16} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-display atelier-display text-[1rem] font-semibold leading-tight tracking-tight text-foreground truncate">
          {project.title}
        </h3>
        {crumb ? (
          <div className="font-mono text-[0.59375rem] uppercase tracking-wider text-text-muted mt-0.5 truncate">
            {crumb}
          </div>
        ) : null}
      </div>

      <span
        className={`atelier-badge hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[0.59375rem] font-mono font-semibold uppercase tracking-wider flex-shrink-0 ${badge.cls}`}
      >
        <span className="w-[5px] h-[5px] rounded-full bg-current" />
        {badge.label}
      </span>

      <div className="hidden md:flex items-center gap-3 font-mono text-[0.625rem] text-text-secondary flex-shrink-0">
        <span className="inline-flex items-center gap-1">
          <Film size={11} className="text-text-muted" />
          {t("shotCount", { count: frameCount })}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={11} className="text-text-muted" />
          {sceneCount}
        </span>
      </div>

      <div
        ref={menuWrapRef}
        className="relative flex-shrink-0"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          disabled={isDeleting}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((openNow) => !openNow);
          }}
          className={`w-8 h-8 rounded-lg grid place-items-center transition-colors disabled:cursor-wait disabled:opacity-60 ${menuOpen ? "text-foreground bg-hover-bg" : "text-text-muted hover:text-foreground hover:bg-hover-bg"}`}
          aria-label={t("moreActions")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {isDeleting ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <MoreVertical size={15} />
          )}
        </button>

        {menuOpen ? (
          <div
            role="menu"
            aria-label={t("moreActions")}
            className="absolute right-0 bottom-full z-[60] mb-2 w-40 overflow-hidden rounded-md border border-glass-border bg-surface/96 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.7)] backdrop-blur-md"
          >
            <button
              type="button"
              role="menuitem"
              ref={firstItemRef}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen(false);
                open();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left font-sans text-body-sm text-foreground transition-colors hover:bg-primary/12 hover:text-primary focus-visible:outline-none focus-visible:bg-primary/12"
            >
              <ExternalLink size={14} aria-hidden="true" />
              {tCommon("open")}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={isDeleting}
              onClick={(event) => void handleDelete(event)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left font-sans text-body-sm text-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-none focus-visible:bg-red-500/10 focus-visible:text-red-400 disabled:cursor-wait disabled:opacity-60"
            >
              <Trash2 size={14} aria-hidden="true" />
              {tCommon("delete")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
