"use client";
/**
 * DialogueAudioRow — PR-3j #3
 *
 * Inline audio control attached to each Shot in Storyboard. Renders a
 * compact row with:
 *   - Play / regenerate button reflecting one of 5 states
 *     (empty | generating | ready | stale | error)
 *   - Chip emotion picker (8 presets + custom text)
 *   - Stale detection: compares current dialogue|voice|instructions
 *     hash against frame.dialogue_text_hash; flags 重生成 when different.
 *
 * Mounted by StoryboardR2V next to the ShotCard so ShotCard stays
 * focused on visual generation.
 *
 * Spec: r2v-workflow-v3-unified.md §4.2 (audio pipeline) + §6.1 PR-3j.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Loader2, RefreshCw, AlertCircle, Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { getAssetUrl } from "@/lib/utils";

// Crypto-free md5 polyfill avoided — instead defer to backend hash on regen;
// we treat any field divergence (dialogue / voice / instructions changed since
// last audio gen) as stale without needing exact md5 parity with the server.
function clientStaleSignal(
    dialogue: string | undefined,
    voiceId: string | undefined,
    instructions: string | undefined,
    snapshot: { dialogue?: string; voiceId?: string; instructions?: string } | null,
): boolean {
    if (!snapshot) return true; // legacy frame
    return (
        (dialogue || "") !== (snapshot.dialogue || "") ||
        (voiceId || "") !== (snapshot.voiceId || "") ||
        (instructions || "") !== (snapshot.instructions || "")
    );
}

interface DialogueAudioRowProps {
    scriptId: string;
    frameId: string;
    dialogue: string | undefined;
    /** Currently-bound character voice; null when no voice assigned */
    voiceId: string | undefined;
    audioUrl: string | undefined;
    audioError: string | null | undefined;
    /** Server-side snapshot at last audio generation. When current state
     *  differs from this snapshot, audio is STALE → user can regenerate. */
    snapshotDialogue?: string;
    snapshotVoiceId?: string;
    snapshotInstructions?: string;
    onAudioUpdated?: () => void;
}

const EMOTION_CHIPS = [
    "neutral",
    "happy",
    "sad",
    "angry",
    "surprised",
    "calm",
    "gentle",
    "serious",
] as const;

export default function DialogueAudioRow({
    scriptId,
    frameId,
    dialogue,
    voiceId,
    audioUrl,
    audioError,
    snapshotDialogue,
    snapshotVoiceId,
    snapshotInstructions,
    onAudioUpdated,
}: DialogueAudioRowProps) {
    const t = useTranslations("dialogueAudio");
    const [busy, setBusy] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emotion, setEmotion] = useState<string>(snapshotInstructions || "");
    const [freeText, setFreeText] = useState<string>("");
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const instructions = useMemo(() => {
        const chip = EMOTION_CHIPS.includes(emotion as any) ? emotion : "";
        const free = freeText.trim();
        if (chip && free) return `${chip}; ${free}`;
        return chip || free || undefined;
    }, [emotion, freeText]);

    const stale = useMemo(() => {
        if (!audioUrl) return false;
        return clientStaleSignal(
            dialogue,
            voiceId,
            instructions,
            { dialogue: snapshotDialogue, voiceId: snapshotVoiceId, instructions: snapshotInstructions },
        );
    }, [audioUrl, dialogue, voiceId, instructions, snapshotDialogue, snapshotVoiceId, snapshotInstructions]);

    useEffect(() => {
        return () => {
            audioRef.current?.pause();
            audioRef.current = null;
        };
    }, []);

    if (!dialogue?.trim()) return null;

    const handlePlay = async () => {
        if (!audioUrl) return;
        if (audioRef.current && playing) {
            audioRef.current.pause();
            setPlaying(false);
            return;
        }
        const audio = new Audio(getAssetUrl(audioUrl));
        audio.onended = () => {
            setPlaying(false);
            if (audioRef.current === audio) audioRef.current = null;
        };
        audio.onerror = () => {
            setPlaying(false);
            setError(t("playFailed"));
        };
        audioRef.current = audio;
        setPlaying(true);
        try {
            await audio.play();
        } catch (e: any) {
            setPlaying(false);
            setError(e?.message || t("playFailed"));
        }
    };

    const handleGenerate = async () => {
        if (!voiceId) {
            setError(t("noVoiceBound"));
            return;
        }
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            setPlaying(false);
        }
        setError(null);
        setBusy(true);
        try {
            await api.generateLineAudio(scriptId, frameId, 1.0, 1.0, 50, instructions);
            onAudioUpdated?.();
        } catch (e: any) {
            setError(e?.message || t("generateFailed"));
        } finally {
            setBusy(false);
        }
    };

    const state: "empty" | "generating" | "ready" | "stale" | "error" =
        busy ? "generating"
            : audioError ? "error"
                : !audioUrl ? "empty"
                    : stale ? "stale"
                        : "ready";

    return (
        <div className="rounded-lg border border-glass-border bg-glass/50 px-3 py-2 space-y-2">
            {/* Top row: status + actions */}
            <div className="flex items-center gap-2">
                <Mic size={12} className="text-text-muted shrink-0" />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                    {t("title")}
                </span>
                <span
                    className={`px-1.5 py-0.5 rounded font-mono text-[9.5px] uppercase tracking-[0.14em] ${
                        state === "ready" ? "bg-primary/10 text-primary" :
                        state === "stale" ? "bg-amber-500/10 text-amber-400" :
                        state === "generating" ? "bg-primary/10 text-primary" :
                        state === "error" ? "bg-status-failed-bg text-status-failed-fg" :
                        "bg-glass text-text-muted"
                    }`}
                >
                    {t(`state.${state}`)}
                </span>
                <div className="ml-auto flex items-center gap-1">
                    {audioUrl && state !== "generating" && (
                        <button
                            onClick={handlePlay}
                            aria-label={playing ? "Pause" : "Play"}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-glass-border bg-black/30 text-text-secondary hover:border-white/20 hover:text-foreground transition-colors"
                        >
                            {playing ? <Pause size={12} /> : <Play size={12} />}
                        </button>
                    )}
                    <button
                        onClick={handleGenerate}
                        disabled={busy || !voiceId}
                        title={!voiceId ? t("noVoiceBound") : undefined}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border transition-colors text-[11px] font-medium ${
                            state === "stale"
                                ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15"
                                : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                        {busy ? (
                            <Loader2 size={11} className="animate-spin" />
                        ) : state === "ready" || state === "stale" ? (
                            <RefreshCw size={11} />
                        ) : (
                            <Mic size={11} />
                        )}
                        {state === "ready" || state === "stale" ? t("regenerate") : t("generate")}
                    </button>
                </div>
            </div>

            {/* Emotion chip picker + free text */}
            <div className="flex flex-wrap items-center gap-1">
                {EMOTION_CHIPS.map((chip) => (
                    <button
                        key={chip}
                        onClick={() => setEmotion(emotion === chip ? "" : chip)}
                        className={`px-2 py-0.5 rounded-full border font-mono text-[9.5px] uppercase tracking-[0.12em] transition-colors ${
                            emotion === chip
                                ? "border-primary bg-primary/15 text-primary"
                                : "border-glass-border bg-black/30 text-text-muted hover:border-white/20 hover:text-text-secondary"
                        }`}
                    >
                        {t(`emotion.${chip}`)}
                    </button>
                ))}
                <input
                    type="text"
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value.slice(0, 80))}
                    placeholder={t("freeTextPlaceholder")}
                    className="flex-1 min-w-[140px] rounded-md border border-glass-border bg-black/30 px-2 py-1 text-[11px] text-foreground placeholder:text-text-muted focus:outline-none focus:border-primary/40"
                />
            </div>

            {/* Inline error */}
            {(audioError || error) && (
                <div className="flex items-center gap-1.5 text-[11px] text-status-failed-fg">
                    <AlertCircle size={11} />
                    <span className="truncate">{audioError || error}</span>
                </div>
            )}
        </div>
    );
}
