"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Image as ImageIcon, Layout, Loader2, Plus, Upload, Wand2, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useProjectStore, type VideoParams } from "@/store/projectStore";
import { api, API_URL, type VideoTask } from "@/lib/api";
import { configuredSecretFields, getSecretFieldForModel, isApprovedModelForCapability } from "@/lib/newApiModels";
import { getAssetUrl, getAssetUrlWithTimestamp } from "@/lib/utils";

interface VideoCreatorProps {
    onTaskCreated: (project: unknown) => void;
    remixData: Partial<VideoTask> | null;
    onRemixClear: () => void;
    params: VideoParams;
    onParamsChange: (params: Partial<VideoParams>) => void;
}

export default function VideoCreator({
    onTaskCreated,
    remixData,
    onRemixClear,
    params,
}: VideoCreatorProps) {
    const t = useTranslations("creator");
    const currentProject = useProjectStore((state) => state.currentProject);
    const updateProject = useProjectStore((state) => state.updateProject);
    const [selectedImages, setSelectedImages] = useState<string[]>([]);
    const [uploadingPaths, setUploadingPaths] = useState<Record<string, string>>({});
    const [source, setSource] = useState<"storyboard" | "upload">("storyboard");
    const [prompt, setPrompt] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPolishing, setIsPolishing] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);

    useEffect(() => {
        if (!remixData) return;
        if (remixData.image_url) setSelectedImages([remixData.image_url]);
        if (remixData.prompt) setPrompt(remixData.prompt);
        onRemixClear();
    }, [remixData, onRemixClear]);

    const availableAssets = useMemo(() => {
        if (!currentProject) return [];
        return [
            ...(currentProject.characters ?? []).map((asset: any) => ({
                url: getAssetUrl(asset.image_url),
                title: asset.name,
            })),
            ...(currentProject.scenes ?? []).map((asset: any) => ({
                url: getAssetUrl(asset.image_url),
                title: asset.name,
            })),
        ].filter((asset) => asset.url);
    }, [currentProject]);

    const selectFrame = (frame: any) => {
        const url = frame.rendered_image_url || frame.image_url;
        if (!url) return;
        setSelectedImages((current) => current.includes(url) ? [] : [url]);
        if (!selectedImages.includes(url)) {
            const dialogue = frame.dialogue ? ` Dialogue: ${frame.dialogue}` : "";
            setPrompt(`${frame.image_prompt || frame.action_description || ""}${dialogue}`.trim());
        }
    };

    const uploadImages = (files: FileList | null) => {
        if (!files) return;
        for (const file of Array.from(files)) {
            const blobUrl = URL.createObjectURL(file);
            setSelectedImages((current) => [...current, blobUrl]);
            void api.uploadFile(file)
                .then((result) => {
                    setUploadingPaths((current) => ({ ...current, [blobUrl]: result.url }));
                })
                .catch((error) => {
                    console.error("Image upload failed", error);
                    setSelectedImages((current) => current.filter((url) => url !== blobUrl));
                    URL.revokeObjectURL(blobUrl);
                });
        }
    };

    const handlePolish = async () => {
        if (!prompt.trim() || !currentProject) return;
        setIsPolishing(true);
        try {
            const result = await api.polishVideoPrompt(prompt.trim(), "", currentProject.id);
            setPrompt(result.prompt_en || result.prompt_cn || prompt);
        } catch (error) {
            console.error("Prompt polish failed", error);
            alert(t("aiPolishFailed"));
        } finally {
            setIsPolishing(false);
        }
    };

    const resolveUploadedImage = (url: string): string | null => {
        if (url.startsWith("blob:")) return uploadingPaths[url] || null;
        if (url.startsWith(`${API_URL}/files/`)) return url.replace(`${API_URL}/files/`, "");
        return url;
    };

    const handleSubmit = async () => {
        if (!currentProject || !prompt.trim() || selectedImages.length === 0 || isSubmitting) return;
        if (!isApprovedModelForCapability(params.model, "video")) {
            alert(`Unsupported video model: ${params.model}`);
            return;
        }

        const secretField = getSecretFieldForModel(params.model, "video");
        try {
            const env = await api.getEnvConfig();
            const configured = configuredSecretFields(env as Record<string, unknown>);
            if (!secretField || !configured[secretField]) {
                alert(`Configure ${secretField || "the selected model key"} in Settings before generating.`);
                return;
            }
        } catch (error) {
            console.error("Unable to validate New API configuration", error);
            alert("Unable to validate New API configuration. Open Settings and try again.");
            return;
        }

        const readyImages = selectedImages
            .map(resolveUploadedImage)
            .filter((url): url is string => Boolean(url));
        if (readyImages.length !== selectedImages.length) {
            alert("Please wait for image uploads to finish.");
            return;
        }

        setIsSubmitting(true);
        try {
            const optimisticTasks: VideoTask[] = [];
            for (const imageUrl of readyImages) {
                const frame = currentProject.frames?.find((item: any) =>
                    (item.rendered_image_url || item.image_url) === imageUrl ||
                    item.image_url === imageUrl ||
                    `${API_URL}/files/${item.image_url}` === imageUrl
                );
                for (let index = 0; index < params.batchSize; index += 1) {
                    optimisticTasks.push({
                        id: `temp-${Date.now()}-${index}-${optimisticTasks.length}`,
                        project_id: currentProject.id,
                        image_url: imageUrl,
                        prompt: prompt.trim(),
                        status: "pending",
                        duration: params.duration,
                        seed: params.seed,
                        resolution: params.resolution,
                        generate_audio: params.generateAudio,
                        batch_size: 1,
                        model: params.model,
                        frame_id: frame?.id,
                        generation_mode: "i2v",
                        ratio: params.ratio,
                        created_at: Date.now() / 1000,
                    } as VideoTask);
                }
            }

            onTaskCreated({
                ...currentProject,
                video_tasks: [...(currentProject.video_tasks || []), ...optimisticTasks],
            });

            for (const imageUrl of readyImages) {
                const frame = currentProject.frames?.find((item: any) =>
                    (item.rendered_image_url || item.image_url) === imageUrl ||
                    item.image_url === imageUrl ||
                    `${API_URL}/files/${item.image_url}` === imageUrl
                );
                await api.createVideoTask(currentProject.id, {
                    image_url: imageUrl,
                    prompt: prompt.trim(),
                    frame_id: frame?.id,
                    duration: params.duration,
                    seed: params.seed,
                    resolution: params.resolution,
                    generate_audio: params.generateAudio,
                    batch_size: params.batchSize,
                    model: params.model,
                    generation_mode: "i2v",
                    ratio: params.ratio,
                    watermark: params.watermark,
                    workbench_tab: "t2i_i2v",
                });
            }

            const updatedProject = await api.getProject(currentProject.id);
            onTaskCreated(updatedProject);
            setSubmitSuccess(true);
            window.setTimeout(() => setSubmitSuccess(false), 1500);
        } catch (error: any) {
            console.error("Video submission failed", error);
            alert(error?.response?.data?.detail || t("submitFailed"));
            const updatedProject = await api.getProject(currentProject.id);
            onTaskCreated(updatedProject);
        } finally {
            setIsSubmitting(false);
        }
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void handleSubmit();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [currentProject, params, prompt, selectedImages, uploadingPaths]);

    const completedVideoIds = new Set(
        currentProject?.video_tasks
            ?.filter((task: VideoTask) => task.status === "completed")
            .map((task: VideoTask) => task.id) ?? [],
    );

    const extractPreviousFrame = async (frameId: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (!currentProject?.frames) return;
        const index = currentProject.frames.findIndex((frame: any) => frame.id === frameId);
        if (index <= 0) return;
        const selectedVideoId = currentProject.frames[index - 1]?.selected_video_id;
        if (!selectedVideoId || !completedVideoIds.has(selectedVideoId)) return;
        try {
            const updated = await api.extractLastFrame(currentProject.id, frameId, selectedVideoId);
            updateProject(currentProject.id, updated);
        } catch (error) {
            console.error("Failed to extract previous frame", error);
        }
    };

    return (
        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-8">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-10">
                <header>
                    <h2 className="flex items-center gap-3 text-2xl font-display font-bold text-foreground">
                        <span className="h-8 w-2 rounded-full bg-primary" />
                        {t("title")}
                        <span className="rounded bg-glass px-2 py-1 font-mono text-xs text-text-muted">I2V · New API</span>
                    </h2>
                    <p className="mt-2 text-sm text-text-secondary">
                        Generate video from a storyboard or uploaded first frame with the selected Seedance model.
                    </p>
                </header>

                <section className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <label className="text-sm font-medium text-text-secondary">{t("firstFrame")}</label>
                        <div className="flex rounded-lg bg-glass p-1">
                            <button
                                type="button"
                                onClick={() => setSource("storyboard")}
                                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${source === "storyboard" ? "bg-primary text-white" : "text-text-secondary"}`}
                            >
                                <Layout size={14} /> {t("storyboardSource")}
                            </button>
                            <button
                                type="button"
                                onClick={() => setSource("upload")}
                                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${source === "upload" ? "bg-primary text-white" : "text-text-secondary"}`}
                            >
                                <Upload size={14} /> {t("uploadSource")}
                            </button>
                        </div>
                    </div>

                    <div className="min-h-[200px] rounded-xl border border-glass-border bg-surface p-4">
                        {source === "storyboard" ? (
                            currentProject?.frames?.length ? (
                                <div className="grid max-h-[480px] grid-cols-1 gap-4 overflow-y-auto p-1 sm:grid-cols-2 lg:grid-cols-3">
                                    {currentProject.frames.map((frame: any, index: number) => {
                                        const url = frame.rendered_image_url || frame.image_url;
                                        const previous = index > 0 ? currentProject.frames![index - 1] : null;
                                        const canExtract = previous?.selected_video_id && completedVideoIds.has(previous.selected_video_id);
                                        return (
                                            <button
                                                type="button"
                                                key={frame.id}
                                                onClick={() => selectFrame(frame)}
                                                className={`group relative aspect-video overflow-hidden rounded-lg border text-left transition ${selectedImages.includes(url) ? "border-primary ring-2 ring-primary/40" : "border-glass-border hover:border-primary/50"}`}
                                            >
                                                {url ? (
                                                    <img src={getAssetUrlWithTimestamp(url, frame.updated_at)} alt="" className="h-full w-full object-cover" />
                                                ) : (
                                                    <span className="flex h-full items-center justify-center text-xs text-text-muted">No image</span>
                                                )}
                                                <span className="absolute left-1 top-1 rounded bg-surface/80 px-1.5 text-[10px] text-text-secondary">#{index + 1}</span>
                                                {canExtract ? (
                                                    <span
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={(event) => void extractPreviousFrame(frame.id, event)}
                                                        className="absolute bottom-1 right-1 rounded bg-surface/90 px-2 py-1 text-[10px] text-primary"
                                                    >
                                                        Previous end frame
                                                    </span>
                                                ) : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-text-muted">
                                    <Layout size={30} />
                                    <span className="text-xs">No storyboard frames found.</span>
                                </div>
                            )
                        ) : (
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                                {selectedImages.map((image, index) => (
                                    <div key={image} className="relative aspect-video overflow-hidden rounded-lg border border-glass-border">
                                        <img src={image.startsWith("blob:") ? image : getAssetUrl(image)} alt="" className="h-full w-full object-cover" />
                                        <button type="button" onClick={() => setSelectedImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-1 top-1 rounded-full bg-surface p-1 text-white">
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                                <label className="flex aspect-video cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-glass-border text-text-secondary hover:border-primary">
                                    <Plus size={22} />
                                    <span className="mt-1 text-xs">Add image</span>
                                    <input type="file" multiple accept="image/*" className="hidden" onChange={(event) => uploadImages(event.target.files)} />
                                </label>
                            </div>
                        )}
                    </div>

                    {availableAssets.length > 0 && source === "upload" ? (
                        <div>
                            <p className="mb-2 text-xs text-text-muted">Quick select from assets</p>
                            <div className="flex gap-2 overflow-x-auto">
                                {availableAssets.slice(0, 12).map((asset) => (
                                    <button type="button" key={asset.url} onClick={() => setSelectedImages([asset.url])} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-glass-border hover:border-primary" title={asset.title}>
                                        <img src={asset.url} alt={asset.title} className="h-full w-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </section>

                <section className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-text-secondary">{t("promptLabel")}</label>
                        <button type="button" onClick={() => void handlePolish()} disabled={!prompt.trim() || isPolishing} className="glass-button flex items-center gap-2 px-3 py-1.5 text-xs disabled:opacity-50">
                            {isPolishing ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                            {isPolishing ? t("polishing") : t("aiPolish")}
                        </button>
                    </div>
                    <textarea
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        placeholder={t("promptPlaceholder")}
                        rows={5}
                        className="glass-input w-full resize-y"
                    />
                </section>

                <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={!currentProject || !prompt.trim() || selectedImages.length === 0 || isSubmitting}
                    className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${submitSuccess ? "bg-emerald-500" : "bg-primary hover:bg-primary/90"}`}
                >
                    {submitSuccess ? <Check size={18} /> : isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
                    {submitSuccess ? "Submitted" : isSubmitting ? t("generatingVideo") : t("generateVideo")}
                </button>
            </div>
        </div>
    );
}
