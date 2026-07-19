"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Video } from "lucide-react";
import { useProjectStore } from "@/store/projectStore";
import VideoCreator from "./VideoCreator";
import VideoSidebar from "./VideoSidebar";
import { api, VideoTask } from "@/lib/api";
import { resolveModelId } from "@/lib/modelCatalog";
import StepHeader from "@/components/shared/StepHeader";

export default function VideoGenerator() {
    const tStep = useTranslations("stepHeader");
    const currentProject = useProjectStore((state) => state.currentProject);
    const updateProject = useProjectStore((state) => state.updateProject);
    const tasks = currentProject?.video_tasks ?? [];

    // Shared state for Remix functionality
    const [remixData, setRemixData] = useState<Partial<VideoTask> | null>(null);

    // Get default model from project settings
    const defaultI2vModel = resolveModelId(
        'i2v',
        currentProject?.model_settings?.video_model ?? currentProject?.model_settings?.i2v_model,
        'video_sidebar',
    );

    // Generation Params (Lifted State)
    const [params, setParams] = useState({
        resolution: "720p",
        duration: 5,
        seed: undefined as number | undefined,
        generateAudio: true,
        batchSize: 1,
        model: defaultI2vModel,
        ratio: "16:9",
        watermark: false,
    });
    const [syncedDefaultModel, setSyncedDefaultModel] = useState(defaultI2vModel);

    // Update the lifted form state before rendering when project defaults
    // change; user selection remains untouched while the default is stable.
    if (defaultI2vModel !== syncedDefaultModel) {
        setSyncedDefaultModel(defaultI2vModel);
        setParams((p) => ({
            ...p,
            model: defaultI2vModel,
        }));
    }

    const handleRemixClear = useCallback(() => setRemixData(null), []);

    // Poll for updates
    useEffect(() => {
        const hasActiveTasks = tasks.some(t => t.status === "pending" || t.status === "processing");
        if (!hasActiveTasks || !currentProject) return;

        const interval = setInterval(async () => {
            try {
                const project = await api.getProject(currentProject.id);
                if (project.video_tasks) {
                    updateProject(currentProject.id, { video_tasks: project.video_tasks });
                }
            } catch (error) {
                console.error("Failed to poll project status:", error);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [tasks, currentProject?.id]);

    const handleTaskCreated = (updatedProject: any) => {
        if (updatedProject.video_tasks) {
            updateProject(currentProject!.id, { video_tasks: updatedProject.video_tasks });
        }
    };

    const handleRemix = (task: VideoTask) => {
        setRemixData({
            image_url: task.image_url,
            prompt: task.prompt,
            seed: task.seed,
            duration: task.duration,
        });

        // Update params state
        setParams(p => ({
            ...p,
            duration: task.duration || 5,
            seed: task.seed,
            resolution: task.resolution || "720p",
            generateAudio: task.generate_audio,
        }));
    };

    const queueCount = tasks.filter(t => t.status === "pending" || t.status === "processing").length;
    const doneCount = tasks.filter(t => t.status === "completed").length;

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            <StepHeader
                stepNumber={5}
                totalSteps={6}
                icon={<Video />}
                englishName="Motion Generator"
                title={tStep("motionTitle")}
                subtitle={tStep("motionSubtitle")}
                trailing={tasks.length > 0 ? (
                    <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-text-muted">
                        <span className="text-foreground font-medium">{tasks.length}</span>
                        <span className="ml-1.5">shots</span>
                        {doneCount > 0 ? (
                            <>
                                <span className="mx-1.5 text-text-muted/40">·</span>
                                <span className="text-primary">{doneCount}</span>
                                <span className="ml-1.5">done</span>
                            </>
                        ) : null}
                        {queueCount > 0 ? (
                            <>
                                <span className="mx-1.5 text-text-muted/40">·</span>
                                <span className="text-foreground">{queueCount}</span>
                                <span className="ml-1.5">in queue</span>
                            </>
                        ) : null}
                    </span>
                ) : undefined}
            />
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Creator (70%) */}
                <div className="w-[70%] h-full border-r border-glass-border">
                    <VideoCreator
                        onTaskCreated={handleTaskCreated}
                        remixData={remixData}
                        onRemixClear={handleRemixClear}
                        params={params}
                        onParamsChange={(newParams) => setParams(p => ({ ...p, ...newParams }))}
                    />
                </div>

                {/* Right: Sidebar (30%) */}
                <div className="w-[30%] h-full">
                    <VideoSidebar
                        tasks={tasks}
                        onRemix={handleRemix}
                        params={params}
                        setParams={setParams}
                    />
                </div>
            </div>
        </div>
    );
}
