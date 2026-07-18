"use client";

import { useMemo, useState } from "react";
import { List, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import GroupedModelGrid from "@/components/common/GroupedModelGrid";
import { type VideoTask, api } from "@/lib/api";
import {
    DEFAULT_I2V_MODEL_ID,
    type DurationConfig,
    VIDEO_I2V_MODELS,
} from "@/lib/modelCatalog";
import { useProjectStore, type VideoParams } from "@/store/projectStore";
import VideoQueue from "./VideoQueue";

interface VideoSidebarProps {
    tasks: VideoTask[];
    onRemix: (task: VideoTask) => void;
    params: VideoParams;
    setParams: (params: VideoParams) => void;
}

const RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"];

export default function VideoSidebar({
    tasks,
    onRemix,
    params,
    setParams,
}: VideoSidebarProps) {
    const t = useTranslations("motion");
    const [activeTab, setActiveTab] = useState<"settings" | "queue">("settings");
    const currentProject = useProjectStore((state) => state.currentProject);
    const updateProject = useProjectStore((state) => state.updateProject);

    const currentModel = useMemo(
        () => VIDEO_I2V_MODELS.find((model) => model.id === params.model)
            ?? VIDEO_I2V_MODELS.find((model) => model.id === DEFAULT_I2V_MODEL_ID)
            ?? VIDEO_I2V_MODELS[0],
        [params.model],
    );

    const update = <K extends keyof VideoParams>(key: K, value: VideoParams[K]) => {
        setParams({ ...params, [key]: value });
    };

    const selectModel = async (modelId: string) => {
        const model = VIDEO_I2V_MODELS.find((item) => item.id === modelId);
        if (!model) return;

        let duration = params.duration;
        const durationConfig = model.duration;
        if (durationConfig.type === "fixed") {
            duration = durationConfig.value;
        } else if (durationConfig.type === "buttons" && !durationConfig.options.includes(duration)) {
            duration = durationConfig.default;
        } else if (
            durationConfig.type === "slider" &&
            (duration < durationConfig.min || duration > durationConfig.max)
        ) {
            duration = durationConfig.default;
        }
        setParams({ ...params, model: modelId, duration });

        if (!currentProject) return;
        try {
            const updatedProject = await api.updateModelSettings(currentProject.id, {
                video_model: modelId,
                i2v_model: modelId,
            });
            updateProject(currentProject.id, updatedProject);
        } catch (error) {
            console.error("Failed to persist project video model", error);
        }
    };

    const durationControl = (config: DurationConfig) => {
        if (config.type === "fixed") {
            return <div className="rounded-lg bg-glass py-2 text-center text-xs text-text-muted">{config.value}s</div>;
        }
        if (config.type === "slider") {
            return (
                <div>
                    <input
                        type="range"
                        min={config.min}
                        max={config.max}
                        step={config.step}
                        value={params.duration}
                        onChange={(event) => update("duration", Number(event.target.value))}
                        className="w-full accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-text-muted">
                        <span>{config.min}s</span>
                        <span className="font-medium text-primary">{params.duration}s</span>
                        <span>{config.max}s</span>
                    </div>
                </div>
            );
        }
        return (
            <div className="grid grid-cols-3 gap-2">
                {config.options.map((duration) => (
                    <button
                        type="button"
                        key={duration}
                        onClick={() => update("duration", duration)}
                        className={`rounded-lg border py-2 text-xs ${params.duration === duration ? "border-primary bg-primary/15 text-primary" : "border-transparent bg-glass text-text-secondary"}`}
                    >
                        {duration}s
                    </button>
                ))}
            </div>
        );
    };

    const activeCount = tasks.filter((task) => task.status === "pending" || task.status === "processing").length;

    return (
        <div className="flex h-full flex-col border-l border-border-subtle bg-surface">
            <div className="flex border-b border-border-subtle">
                <button
                    type="button"
                    onClick={() => setActiveTab("settings")}
                    className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium ${activeTab === "settings" ? "border-b-2 border-primary text-foreground" : "text-text-muted"}`}
                >
                    <Settings2 size={16} />
                    {t("motionParams")}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("queue")}
                    className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium ${activeTab === "queue" ? "border-b-2 border-primary text-foreground" : "text-text-muted"}`}
                >
                    <List size={16} />
                    {t("queue")}
                    {activeCount > 0 ? <span className="rounded-full bg-primary px-1.5 text-[10px] text-white">{activeCount}</span> : null}
                </button>
            </div>

            {activeTab === "queue" ? (
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <VideoQueue tasks={tasks} onRemix={onRemix} />
                </div>
            ) : (
                <div className="min-h-0 flex-1 space-y-7 overflow-y-auto p-6 custom-scrollbar">
                    <section className="space-y-3">
                        <div>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">New API video model</h3>
                            <p className="mt-1 text-[11px] text-text-muted">Only approved Seedance models are available.</p>
                        </div>
                        <GroupedModelGrid
                            models={VIDEO_I2V_MODELS}
                            selectedId={params.model}
                            onSelect={(modelId) => void selectModel(modelId)}
                        />
                    </section>

                    <section className="space-y-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">{t("basicSettings")}</h3>
                        <div>
                            <label className="mb-2 block text-xs text-text-secondary">{t("durationLabel")}</label>
                            {durationControl(currentModel?.duration ?? { type: "slider", min: 4, max: 15, step: 1, default: 5 })}
                        </div>
                        <div>
                            <label className="mb-2 block text-xs text-text-secondary">Resolution</label>
                            <div className="grid grid-cols-2 gap-2">
                                {["720p", "1080p"].map((resolution) => (
                                    <button
                                        type="button"
                                        key={resolution}
                                        onClick={() => update("resolution", resolution)}
                                        className={`rounded-lg border py-2 text-xs ${params.resolution === resolution ? "border-primary bg-primary/15 text-primary" : "border-transparent bg-glass text-text-secondary"}`}
                                    >
                                        {resolution}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="mb-2 block text-xs text-text-secondary">Aspect ratio</label>
                            <select
                                value={params.ratio}
                                onChange={(event) => update("ratio", event.target.value)}
                                className="glass-input w-full text-xs"
                            >
                                {RATIOS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="mb-2 block text-xs text-text-secondary">Batch size</label>
                            <div className="grid grid-cols-4 gap-2">
                                {[1, 2, 3, 4].map((count) => (
                                    <button
                                        type="button"
                                        key={count}
                                        onClick={() => update("batchSize", count)}
                                        className={`rounded-lg border py-2 text-xs ${params.batchSize === count ? "border-primary bg-primary/15 text-primary" : "border-transparent bg-glass text-text-secondary"}`}
                                    >
                                        {count}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="mb-2 block text-xs text-text-secondary">Seed (optional)</label>
                            <input
                                type="number"
                                value={params.seed ?? ""}
                                onChange={(event) => update("seed", event.target.value === "" ? undefined : Number(event.target.value))}
                                className="glass-input w-full text-xs"
                                placeholder="Random"
                            />
                        </div>
                    </section>

                    <section className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Output</h3>
                        <Toggle
                            label="Generate synchronized audio"
                            checked={params.generateAudio}
                            onChange={(checked) => update("generateAudio", checked)}
                        />
                        <Toggle
                            label="Watermark"
                            checked={params.watermark}
                            onChange={(checked) => update("watermark", checked)}
                        />
                    </section>
                </div>
            )}
        </div>
    );
}
function Toggle({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="flex cursor-pointer items-center justify-between rounded-lg bg-glass px-3 py-2 text-xs text-text-secondary">
            <span>{label}</span>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-primary" />
        </label>
    );
}
