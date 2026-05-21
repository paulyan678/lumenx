"use client";
/**
 * T2ISubsection — compact T2I 抽卡 unit inside the I2V tab's
 * ParamsSection. Layout per design grill Q13:
 *
 *   ┌─ T2I 首帧 ─────────────────────────────────────┐
 *   │ ┌────────┐  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐         │
 *   │ │ ACTIVE │  │○ ││○ ││● ││○ ││○ ││+ │         │
 *   │ │ 首帧   │  │  ││  ││  ││  ││  ││gn│         │
 *   │ └────────┘  └──┘└──┘└──┘└──┘└──┘└──┘         │
 *   │  ~120px      ~60px thumbs, hover×, click→active │
 *   └─────────────────────────────────────────────────┘
 *
 * Design rules:
 *   - Active首帧 = the one used as input for I2V下游
 *   - Click any thumb → it becomes active (single-select radio)
 *   - Hover a thumb → small ✕ in corner → click to delete
 *   - Last tile is "+ gen" — triggers Generate T2I, new image
 *     appended + auto-active
 *   - No ★, no label, no batch grouping, no compare (T2I is
 *     supporting role per user)
 *   - Cap at T2I_HISTORY_LIMIT (10) FIFO so localStorage doesn't
 *     accrete forever
 */
import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { PendingTaskAffordance } from "@/components/shared/PendingTaskAffordance";

interface T2ISubsectionProps {
    imageUrls: string[];
    selectedIndex: number;
    /** True while a T2I generation is in flight — disables Generate
     *  to prevent stacking. Spinner shows in the "+gen" tile slot. */
    generating: boolean;
    /** Optional: task id of the most recent in-flight T2I task,
     *  surfaced to the inline PendingTaskAffordance for diagnose UX. */
    inFlightTaskId?: string;
    /** "pending" or "processing" — drives the spinner state. Falsy
     *  means no active task. */
    inFlightStatus?: "pending" | "processing" | "completed" | "failed";
    onSelect: (index: number) => void;
    onRemove: (index: number) => void;
    onGenerate: () => void;
    /** Optional: resolve a URL to display-ready form (some URLs are
     *  relative paths needing asset prefix). Passed in by host so
     *  this component stays free of /lib/utils import. */
    resolveUrl?: (url: string) => string;
}

export default function T2ISubsection({
    imageUrls,
    selectedIndex,
    generating,
    inFlightTaskId,
    inFlightStatus,
    onSelect,
    onRemove,
    onGenerate,
    resolveUrl,
}: T2ISubsectionProps) {
    const safeIndex = imageUrls.length === 0
        ? 0
        : Math.max(0, Math.min(selectedIndex, imageUrls.length - 1));
    const activeUrl = imageUrls[safeIndex];
    const display = (u: string) => (resolveUrl ? resolveUrl(u) : u);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    return (
        <div className="space-y-2">
            <div className="flex items-start gap-3">
                {/* Active首帧 large preview — display tier label
                    "Now editing" promotes the focal frame to display
                    level so the workbench has a visual anchor (P0-2). */}
                <div className="flex shrink-0 flex-col gap-1">
                    <div className="font-display text-display-sm font-semibold tracking-tight text-foreground/95">
                        Active frame
                    </div>
                    <div className="relative h-[90px] w-[120px] overflow-hidden rounded-md border border-glass-border bg-black/40">
                        {activeUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={display(activeUrl)}
                                alt="Active T2I首帧"
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div className="grid h-full w-full place-items-center font-mono text-chrome-sm font-medium uppercase text-text-muted">
                                no T2I yet
                            </div>
                        )}
                        {/* If inflight + no current active, overlay diagnose
                            affordance on the placeholder */}
                        {generating && !activeUrl ? (
                            <div className="absolute inset-0 grid place-items-center bg-black/65 backdrop-blur-[1px]">
                                <PendingTaskAffordance
                                    statusLabel={inFlightStatus === "pending" ? "Queued" : "Generating"}
                                    taskId={inFlightTaskId}
                                    compact
                                />
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Thumbnail strip */}
                <div className="flex flex-1 flex-wrap items-start gap-1.5 pt-[22px]">
                    {imageUrls.map((url, idx) => {
                        const active = idx === safeIndex;
                        return (
                            <button
                                key={`${url}-${idx}`}
                                type="button"
                                onMouseEnter={() => setHoveredIdx(idx)}
                                onMouseLeave={() => setHoveredIdx((cur) => (cur === idx ? null : cur))}
                                onClick={() => onSelect(idx)}
                                aria-pressed={active}
                                aria-label={`T2I candidate ${idx + 1}${active ? " (active)" : ""}`}
                                className={`group relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-md border transition-colors duration-fast ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-black ${
                                    active
                                        ? "border-primary/70 ring-1 ring-primary/40"
                                        : "border-glass-border hover:border-white/30"
                                }`}
                                title={active ? "Active首帧" : "Click to make active"}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={display(url)}
                                    alt=""
                                    className={`h-full w-full object-cover transition-opacity duration-fast ease-out-quart ${
                                        active ? "" : "opacity-70 group-hover:opacity-100"
                                    }`}
                                />
                                {/* Active stripe — width transitions from 0 → 100%
                                    on selection change for affirming feedback. */}
                                <span
                                    aria-hidden="true"
                                    className={`absolute bottom-0 left-0 h-[2px] bg-primary transition-[width] duration-base ease-out-quart ${
                                        active ? "w-full" : "w-0"
                                    }`}
                                />
                                {/* Hover × in corner — clicks delete this candidate.
                                    24×24 hit area on a 16×16 visual via padding. */}
                                {hoveredIdx === idx ? (
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        aria-label="Delete T2I candidate"
                                        title="Delete"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemove(idx);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onRemove(idx);
                                            }
                                        }}
                                        className="absolute right-0 top-0 grid h-6 w-6 cursor-pointer place-items-center rounded-full text-white/95 transition-colors duration-fast ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-failed-border"
                                    >
                                        <span className="grid h-4 w-4 place-items-center rounded-full bg-black/75 transition-colors duration-fast ease-out-quart hover:bg-status-failed-fg">
                                            <X size={9} aria-hidden="true" />
                                        </span>
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}

                    {/* +gen tile */}
                    <button
                        type="button"
                        onClick={onGenerate}
                        disabled={generating}
                        aria-label="Generate new T2I candidate"
                        className="grid h-[60px] w-[60px] shrink-0 place-items-center rounded-md border border-dashed border-white/15 bg-black/20 text-text-muted transition-colors duration-fast ease-out-quart hover:border-primary/55 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 disabled:cursor-wait disabled:opacity-60"
                        title="Generate new T2I candidate"
                    >
                        {generating ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        ) : (
                            <Plus size={16} aria-hidden="true" />
                        )}
                    </button>
                </div>
            </div>

            {/* Metadata line — chrome tier, contrast-safe */}
            {activeUrl ? (
                <div className="px-1 font-mono text-chrome-sm tracking-tight text-text-muted">
                    Active: thumb-{safeIndex + 1} of {imageUrls.length}
                    {imageUrls.length >= 10 ? (
                        <span className="ml-2 text-status-starred-fg">· history at cap (10), oldest dropped on next gen</span>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
