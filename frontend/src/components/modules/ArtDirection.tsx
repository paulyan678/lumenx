"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Palette, Wand2, Plus, Check, Loader2, ChevronRight, Lock, RotateCcw, ArrowUp, AlertTriangle, X } from "lucide-react";
import { useProjectStore, type StyleConfig, type StylePreset } from "@/store/projectStore"; // Combined imports
import { api } from "@/lib/api";
import StepHeader from "@/components/shared/StepHeader";
import WorkflowActionButton from "@/components/shared/WorkflowActionButton";
import SidePanelHeader from "@/components/shared/SidePanelHeader";
import { toast } from "@/store/toastStore";

export default function ArtDirection() {
    const ta = useTranslations("artDirection");
    const tStep = useTranslations("stepHeader");
    const {
        currentProject,
        updateProject,
        isAnalyzingArtStyle,
        analyzeArtStyle
    } = useProjectStore();

    const [selectedStyle, setSelectedStyle] = useState<StyleConfig | null>(null);
    const [customStyles, setCustomStyles] = useState<StyleConfig[]>([]);
    const [aiRecommendations, setAiRecommendations] = useState<StyleConfig[]>([]);
    const [presets, setPresets] = useState<StylePreset[]>([]); // Changed type to StylePreset[]

    // Editor state
    const [editingName, setEditingName] = useState("");
    const [editingPositive, setEditingPositive] = useState("");
    const [editingNegative, setEditingNegative] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Series baseline (inherit source). Fetched on mount/project change.
    const [seriesBaseline, setSeriesBaseline] = useState<StyleConfig | null>(null);
    const [seriesBaselineLoading, setSeriesBaselineLoading] = useState(false);
    const [bannerBusy, setBannerBusy] = useState(false);
    // Confirm-override dialog (gates the first preset click while inheriting,
    // per design grill: never silently 'unlock' — always explicit when
    // diverging from the series baseline).
    const [pendingOverrideStyle, setPendingOverrideStyle] = useState<StyleConfig | null>(null);
    // True after the user explicitly accepted the override prompt for this
    // editing session but before they hit Apply. Drives the amber 'preview'
    // banner + editor ring so the user knows their changes aren't yet saved.
    const [overrideAccepted, setOverrideAccepted] = useState(false);

    useEffect(() => {
        // Reset session-only state when switching projects
        setOverrideAccepted(false);
        setPendingOverrideStyle(null);
        const seriesId = currentProject?.series_id;
        if (!seriesId) {
            setSeriesBaseline(null);
            return;
        }
        setSeriesBaselineLoading(true);
        api.getSeries(seriesId)
            .then((s: any) => {
                setSeriesBaseline(s?.art_direction?.style_config ?? null);
            })
            .catch(() => setSeriesBaseline(null))
            .finally(() => setSeriesBaselineLoading(false));
    }, [currentProject?.series_id, currentProject?.id]);

    // Inherit-state derivation (project relative to series baseline).
    const projectStyle = currentProject?.art_direction?.style_config ?? null;
    const inSeries = !!currentProject?.series_id;
    const isInherit = inSeries && !!seriesBaseline && !projectStyle;
    const isOverridden = inSeries && !!seriesBaseline && !!projectStyle;
    const canPromote = inSeries && !seriesBaseline && !!projectStyle;
    // 'Preview' = user clicked override-confirm in inherit mode and is
    // editing/selecting a new style that hasn't been Applied yet.
    const isPreview = isInherit && overrideAccepted;
    // Editor textareas: read-only ONLY when truly inheriting without an
    // active override decision. The old isUnlocked toggle is gone —
    // accepting the override dialog flips the editor to editable directly.
    const editorReadOnly = isInherit && !overrideAccepted;

    // R2V v2 Phase P0-b — clear project art_direction (return to series inherit).
    const handleResetToSeries = async () => {
        if (!currentProject?.id) return;
        setBannerBusy(true);
        try {
            const fresh = await api.clearProjectArtDirection(currentProject.id);
            // Refresh project in store
            updateProject(currentProject.id, fresh);
            setSelectedStyle(null);
            setEditingName("");
            setEditingPositive("");
            setEditingNegative("");
            setOverrideAccepted(false);
            toast.success(ta("toastResetDone"), {
                projectId: currentProject.id,
                projectTitle: currentProject.title,
            });
        } catch (err) {
            console.error("Reset to series baseline failed", err);
            toast.error(ta("toastResetFailed"), {
                projectId: currentProject?.id,
                projectTitle: currentProject?.title,
            });
        } finally {
            setBannerBusy(false);
        }
    };

    const handlePromoteToSeries = async () => {
        if (!currentProject?.series_id || !currentProject?.art_direction) return;
        setBannerBusy(true);
        try {
            await api.updateSeries(currentProject.series_id, {
                art_direction: currentProject.art_direction as any,
            });
            // Reload series baseline locally
            const s = await api.getSeries(currentProject.series_id);
            setSeriesBaseline(s?.art_direction?.style_config ?? null);
        } catch (err) {
            console.error("Promote to series baseline failed", err);
        } finally {
            setBannerBusy(false);
        }
    };

    // Load presets only once on mount (separate from project-dependent state)
    useEffect(() => {
        loadPresets();
    }, []);  // Empty dependency - only run on mount

    // Load art direction from project when it changes. If the project
    // itself has none but the parent series does (isInherit), display the
    // series baseline as the visible style — otherwise the banner says
    // "继承自 Pixar 3D" while the editor below stays blank, which the user
    // (rightly) read as "系列风格在 episode 看不到".
    useEffect(() => {
        const projectAD = currentProject?.art_direction;
        const projectStyleConfig = projectAD?.style_config ?? null;
        if (projectStyleConfig) {
            console.log("Loading Art Direction (project override):", projectAD);
            setSelectedStyle(projectStyleConfig);
            setEditingName(projectStyleConfig.name || "");
            setEditingPositive(projectStyleConfig.positive_prompt || "");
            setEditingNegative(projectStyleConfig.negative_prompt || "");
            setCustomStyles(projectAD?.custom_styles || []);
            if (projectAD?.ai_recommendations && projectAD.ai_recommendations.length > 0) {
                setAiRecommendations(projectAD.ai_recommendations);
            }
        } else if (seriesBaseline) {
            // Inherit display: project has no override → mirror series baseline
            // into editor fields so user can SEE what they're inheriting.
            // Editor stays locked (editorLocked = isInherit && !isUnlocked)
            // until user explicitly clicks 解锁编辑.
            console.log("Loading Art Direction (series baseline inherit):", seriesBaseline);
            setSelectedStyle(seriesBaseline);
            setEditingName(seriesBaseline.name || "");
            setEditingPositive(seriesBaseline.positive_prompt || "");
            setEditingNegative(seriesBaseline.negative_prompt || "");
            setCustomStyles(projectAD?.custom_styles || []);
        } else {
            console.log("No Art Direction found in currentProject or series");
        }
    }, [currentProject?.id, currentProject?.art_direction, seriesBaseline]);

    // Sync local aiRecommendations with store when it updates (e.g. after analysis finishes)
    useEffect(() => {
        if (currentProject?.art_direction?.ai_recommendations) {
            setAiRecommendations(currentProject.art_direction.ai_recommendations);
        }
    }, [currentProject?.art_direction?.ai_recommendations]);

    const loadPresets = async () => {
        try {
            const data = await api.getStylePresets();
            console.log("Loaded presets:", data.presets);
            setPresets(data.presets || []);
        } catch (error) {
            console.error("Failed to load presets:", error);
        }
    };

    const handleAnalyze = async () => {
        if (!currentProject) return;

        // Use global action
        try {
            await analyzeArtStyle(
                currentProject.id,
                currentProject.originalText || currentProject.title
            );
        } catch (error) {
            console.error("Failed to analyze script:", error);
            toast.error(ta("analysisFailed"), {
                projectId: currentProject?.id,
                projectTitle: currentProject?.title,
            });
        }
    };

    const toStyleConfig = (style: StyleConfig | StylePreset): StyleConfig => {
        if ("positive_prompt" in style) {
            return style;
        }

        return {
            id: style.id,
            name: style.name,
            positive_prompt: style.prompt,
            negative_prompt: style.negative_prompt || "",
            is_custom: false,
        };
    };

    const applyStyleToEditor = (style: StyleConfig | StylePreset) => {
        const normalizedStyle = toStyleConfig(style);
        setSelectedStyle(normalizedStyle);
        setEditingName(normalizedStyle.name);
        setEditingPositive(normalizedStyle.positive_prompt);
        setEditingNegative(normalizedStyle.negative_prompt);
    };

    const handleSelectStyle = (style: StyleConfig | StylePreset) => {
        const normalizedStyle = toStyleConfig(style);
        // Picking the same style that's already the series baseline is a
        // no-op — let it through without an override prompt.
        const isSeriesBaseline = isInherit && seriesBaseline && normalizedStyle.id === seriesBaseline.id;
        // Inherit mode + user picks something other than the series baseline
        // → open the explicit override confirm dialog (per design grill).
        if (isInherit && !overrideAccepted && !isSeriesBaseline) {
            setPendingOverrideStyle(normalizedStyle);
            return;
        }
        applyStyleToEditor(normalizedStyle);
    };

    const confirmOverridePreview = () => {
        if (!pendingOverrideStyle) return;
        setOverrideAccepted(true);
        applyStyleToEditor(pendingOverrideStyle);
        toast.info(ta("toastOverridePreviewing", { name: pendingOverrideStyle.name }), {
            projectId: currentProject?.id,
            projectTitle: currentProject?.title,
            body: ta("toastOverridePreviewingBody"),
        });
        setPendingOverrideStyle(null);
    };

    const cancelOverrideConfirm = () => setPendingOverrideStyle(null);

    const handleSaveCustom = async () => {
        if (!editingName || !editingPositive) {
            toast.warning(ta("fillNameAndPrompt"), {
                projectId: currentProject?.id,
                projectTitle: currentProject?.title,
            });
            return;
        }

        const newCustomStyle: StyleConfig = {
            id: `custom-${Date.now()}`,
            name: editingName,
            positive_prompt: editingPositive,
            negative_prompt: editingNegative,
            is_custom: true
        };

        const updatedCustomStyles = [...customStyles, newCustomStyle];
        setCustomStyles(updatedCustomStyles);

        // Always try to save immediately
        if (currentProject && selectedStyle) {
            try {
                // Use the newly created style as the selected style if it's the one being edited
                // Or keep the currently selected style
                const updated = await api.saveArtDirection(
                    currentProject.id,
                    selectedStyle.id,
                    selectedStyle,
                    updatedCustomStyles,
                    aiRecommendations
                );
                updateProject(currentProject.id, updated);
                toast.success(ta("customStyleSaved"), {
                    projectId: currentProject.id,
                    projectTitle: currentProject.title,
                });
            } catch (error) {
                console.error("Failed to save custom style:", error);
                toast.error(ta("saveFailed"), {
                    projectId: currentProject?.id,
                    projectTitle: currentProject?.title,
                });
            }
        }
    };

    const handleApply = async () => {
        if (!currentProject || !selectedStyle) {
            toast.warning(ta("selectStyleFirst"), {
                projectId: currentProject?.id,
                projectTitle: currentProject?.title,
            });
            return;
        }

        const finalConfig: StyleConfig = {
            ...selectedStyle,
            name: editingName,
            positive_prompt: editingPositive,
            negative_prompt: editingNegative
        };

        setIsSaving(true);
        try {
            const updated = await api.saveArtDirection(
                currentProject.id,
                finalConfig.id,
                finalConfig,
                customStyles,
                aiRecommendations
            );
            updateProject(currentProject.id, updated);
            setOverrideAccepted(false); // override is now persisted, leave preview state
            toast.success(ta("styleApplied"), {
                projectId: currentProject.id,
                projectTitle: currentProject.title,
                body: ta("styleAppliedBody", { name: finalConfig.name }),
            });
        } catch (error) {
            console.error("Failed to save art direction:", error);
            toast.error(ta("saveFailedShort"), {
                projectId: currentProject?.id,
                projectTitle: currentProject?.title,
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        // Layout v4: outermost horizontal split. Right Style editor is its
        // own floor-to-ceiling column; main left column owns StepHeader + AI/
        // presets + bottom action bar.
        <div className="flex h-full w-full overflow-hidden">
            {/* Left: main column */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <StepHeader
                    stepNumber={2}
                    icon={<Palette />}
                    englishName="Style"
                    title={tStep("styleTitle")}
                    subtitle={tStep("styleSubtitle")}
                    /* trailing intentionally empty — 应用并继续 moved to
                       bottom sticky bar (semantically a "末步 footer"). */
                />

                {/* Scrollable AI + Presets */}
                <div className="flex-1 min-h-0 flex flex-col p-8 overflow-y-auto gap-8 bg-surface">
                    {/* R2V v2 Phase 2: inherit / preview / override / promote banner */}
                    {inSeries && !seriesBaselineLoading && (
                        <>
                            {/* INHERIT — pure: project tracks series baseline,
                                no override decision pending. Action hint:
                                'pick any preset below to override'. No
                                unlock button (legacy concept removed). */}
                            {isInherit && !overrideAccepted && (
                                <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
                                    <Lock size={16} className="text-primary shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-foreground">
                                            <span className="text-text-secondary">{ta("inheritsBaseline")}</span>{" "}
                                            <span className="font-medium">{seriesBaseline?.name}</span>
                                        </p>
                                        <p className="text-[11px] text-text-muted mt-0.5">{ta("inheritHint")}</p>
                                    </div>
                                </div>
                            )}
                            {/* PREVIEW — user accepted override but hasn't
                                Applied yet. Amber banner makes it obvious
                                the change isn't saved + drives them toward
                                the Apply CTA in the sticky footer. */}
                            {isPreview && (
                                <div className="flex items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3">
                                    <AlertTriangle size={16} className="text-amber-300 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-foreground">
                                            <span className="text-amber-200">{ta("previewBannerTitle")}</span>{" "}
                                            <span className="font-medium">{selectedStyle?.name ?? "—"}</span>
                                            <span className="text-text-secondary text-[12px]">
                                                {" "}({ta("baselineLabel")}: {seriesBaseline?.name})
                                            </span>
                                        </p>
                                        <p className="text-[11px] text-text-muted mt-0.5">{ta("previewBannerHint")}</p>
                                    </div>
                                    <WorkflowActionButton
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setOverrideAccepted(false);
                                            // Reset editor back to series baseline display
                                            if (seriesBaseline) applyStyleToEditor(seriesBaseline);
                                        }}
                                    >
                                        {ta("cancelOverride")}
                                    </WorkflowActionButton>
                                </div>
                            )}
                            {isOverridden && (
                                <div className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3">
                                    <RotateCcw size={16} className="text-amber-300 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-foreground">
                                            <span className="text-amber-200">{ta("overridingBaseline")}</span>{" "}
                                            <span className="text-text-secondary text-[12px]">
                                                ({ta("baselineLabel")}: {seriesBaseline?.name})
                                            </span>
                                        </p>
                                        <p className="text-[11px] text-text-muted mt-0.5">{ta("overrideHint")}</p>
                                    </div>
                                    <WorkflowActionButton
                                        variant="secondary"
                                        size="sm"
                                        loading={bannerBusy}
                                        leftIcon={<RotateCcw />}
                                        onClick={handleResetToSeries}
                                    >
                                        {ta("resetToSeries")}
                                    </WorkflowActionButton>
                                </div>
                            )}
                            {canPromote && (
                                <div className="flex items-center gap-3 rounded-lg border border-purple-400/30 bg-purple-400/10 px-4 py-3">
                                    <ArrowUp size={16} className="text-purple-300 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-foreground">{ta("promotePromptTitle")}</p>
                                        <p className="text-[11px] text-text-muted mt-0.5">{ta("promotePromptHint")}</p>
                                    </div>
                                    <WorkflowActionButton
                                        variant="secondary"
                                        size="sm"
                                        loading={bannerBusy}
                                        leftIcon={<ArrowUp />}
                                        onClick={handlePromoteToSeries}
                                    >
                                        {ta("promoteBtn")}
                                    </WorkflowActionButton>
                                </div>
                            )}
                        </>
                    )}

                    {/* AI Recommendations */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <Sparkles size={20} className="text-yellow-400" />
                                {ta("aiRecommendations")}
                            </h3>
                            <WorkflowActionButton
                                variant="secondary"
                                loading={isAnalyzingArtStyle}
                                leftIcon={<Wand2 />}
                                onClick={handleAnalyze}
                                disabled={isAnalyzingArtStyle}
                            >
                                {isAnalyzingArtStyle ? ta("analyzing") : ta("analyzeScript")}
                            </WorkflowActionButton>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {aiRecommendations.map((style) => (
                                <StyleRecommendationCard
                                    key={style.id}
                                    style={style}
                                    isSelected={selectedStyle?.id === style.id}
                                    onSelect={() => handleSelectStyle(style)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Built-in Presets */}
                    <div>
                        <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                            <Palette size={20} className="text-blue-400" />
                            {ta("builtInPresets")}
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                            {presets.map((style) => (
                                <StylePresetCard
                                    key={style.id}
                                    style={style}
                                    isSelected={selectedStyle?.id === style.id}
                                    onSelect={() => handleSelectStyle(style)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Custom Styles */}
                    {customStyles.length > 0 && (
                        <div>
                            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                                <Plus size={20} className="text-green-400" />
                                {ta("customStyles")}
                            </h3>

                            <div className="grid grid-cols-2 gap-4">
                                {customStyles.map((style) => (
                                    <StylePresetCard
                                        key={style.id}
                                        style={style}
                                        isSelected={selectedStyle?.id === style.id}
                                        onSelect={() => handleSelectStyle(style)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom sticky bar — "末步 footer" 语义：在 main 完成所有
                    style 选择后，主行动按钮 sticky 在底部承接"进入下一步"意图。
                    比挂在 page header 右侧更符合用户的操作流。 */}
                <div className="shrink-0 border-t border-glass-border bg-surface/95 backdrop-blur-md px-8 py-3 flex items-center justify-end gap-3">
                    {selectedStyle ? (
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                            <span className="text-foreground">{selectedStyle.name}</span>
                            <span className="mx-1.5">·</span>
                            <span>selected</span>
                        </span>
                    ) : (
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                            select a style →
                        </span>
                    )}
                    <WorkflowActionButton
                        variant="primary"
                        loading={isSaving}
                        rightIcon={<ChevronRight />}
                        onClick={handleApply}
                        disabled={!selectedStyle}
                    >
                        {isSaving ? ta("saving") : ta("applyAndContinue")}
                    </WorkflowActionButton>
                </div>
            </div>

            {/* Right: independent Style Editor panel — floor-to-ceiling.
                Border + status pill switch color to reflect override state
                so the user can SEE that the panel is editable / will save. */}
            <div
                className={`w-[360px] shrink-0 flex flex-col bg-surface border-l overflow-hidden transition-colors ${
                    isPreview
                        ? "border-amber-400/60"
                        : isOverridden
                            ? "border-amber-400/40"
                            : "border-glass-border"
                }`}
            >
                <SidePanelHeader
                    icon={<Palette />}
                    title={ta("styleEditor")}
                    subtitle={selectedStyle?.name ?? ta("selectStyleHint")}
                />
                {(isPreview || isOverridden) && (
                    <div className={`px-4 py-2 border-b ${isPreview ? "border-amber-400/40 bg-amber-400/10" : "border-amber-400/30 bg-amber-400/5"}`}>
                        <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-amber-200">
                            {isPreview ? ta("editorStatePreview") : ta("editorStateOverride")}
                        </p>
                    </div>
                )}
                {editorReadOnly && (
                    <div className="px-4 py-2 border-b border-primary/30 bg-primary/5">
                        <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-primary">
                            {ta("editorStateInherit")}
                        </p>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto p-6">
                    <StyleEditor
                        name={editingName}
                        positivePrompt={editingPositive}
                        negativePrompt={editingNegative}
                        onNameChange={setEditingName}
                        onPositiveChange={setEditingPositive}
                        onNegativeChange={setEditingNegative}
                        onSaveCustom={handleSaveCustom}
                        selectedStyle={selectedStyle}
                        readOnly={editorReadOnly}
                    />
                </div>
            </div>

            {/* Override confirmation dialog (per design grill: explicit
                step before forking from the series baseline). */}
            {pendingOverrideStyle && (
                <div
                    className="fixed inset-0 z-[110] bg-overlay backdrop-blur-sm grid place-items-center p-4"
                    onClick={cancelOverrideConfirm}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-glass-border bg-elevated shadow-[0_24px_64px_-12px_rgba(0,0,0,0.7)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-glass-border">
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={15} className="text-amber-300" />
                                <h2 className="text-display font-medium text-foreground">{ta("overrideConfirmTitle")}</h2>
                            </div>
                            <button
                                onClick={cancelOverrideConfirm}
                                aria-label={ta("close") || "Close"}
                                className="p-1.5 rounded-lg hover:bg-hover-bg text-text-muted hover:text-foreground transition-colors"
                            >
                                <X size={15} />
                            </button>
                        </header>
                        <div className="px-5 py-4 space-y-3">
                            <p className="text-body-sm text-text-secondary leading-relaxed">
                                {ta("overrideConfirmIntro")}
                            </p>
                            <div className="rounded-lg border border-glass-border bg-glass px-3 py-2 space-y-1">
                                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">{ta("overrideFromTo")}</p>
                                <p className="text-[13px] text-foreground">
                                    <span className="text-text-secondary">{seriesBaseline?.name ?? "—"}</span>
                                    <span className="mx-2 text-text-muted">→</span>
                                    <span className="font-medium text-amber-200">{pendingOverrideStyle.name}</span>
                                </p>
                            </div>
                            <p className="text-[11.5px] text-text-muted">{ta("overrideConfirmFooter")}</p>
                        </div>
                        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-glass-border">
                            <WorkflowActionButton variant="ghost" size="sm" onClick={cancelOverrideConfirm}>
                                {ta("overrideCancelBtn")}
                            </WorkflowActionButton>
                            <WorkflowActionButton variant="primary" size="sm" onClick={confirmOverridePreview} leftIcon={<Check />}>
                                {ta("overrideConfirmBtn")}
                            </WorkflowActionButton>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
}

// Sub-components
function StyleRecommendationCard({ style, isSelected, onSelect }: any) {
    const ta = useTranslations("artDirection");
    return (
        <motion.div
            layout
            onClick={onSelect}
            className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${isSelected
                ? "bg-purple-500/20 border-purple-500 shadow-lg shadow-purple-500/20"
                : "bg-surface border-glass-border hover:border-glass-border hover:bg-hover-bg"
                }`}
        >
            <div className="flex items-start gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isSelected ? 'bg-purple-500' : 'bg-hover-bg'}`}>
                    {isSelected ? <Check size={16} className=": text-foreground" /> : <Sparkles size={16} className="text-text-secondary" />}
                </div>
                <div className="flex-1">
                    <h4 className="font-bold text-foreground mb-1">{style.name}</h4>
                    <p className="text-xs text-text-secondary mb-3">{style.description}</p>
                    {style.reason && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-3">
                            <p className="text-xs text-yellow-300">
                                <span className="font-bold">{ta("reasonLabel")}</span>
                                {style.reason}
                            </p>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {style.positive_prompt.split(",").slice(0, 3).map((keyword: string, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-1 bg-primary/20 text-primary rounded border border-primary/30">
                                {keyword.trim()}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export function StylePresetCard({ style, isSelected, onSelect }: any) {
    return (
        <motion.div
            layout
            onClick={onSelect}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${isSelected
                ? "bg-blue-500/20 border-blue-500 shadow-lg shadow-blue-500/20"
                : "bg-surface border-glass-border hover:border-glass-border hover:bg-hover-bg"
                }`}
        >
            <div className="flex items-center gap-3 mb-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isSelected ? 'bg-blue-500' : 'bg-hover-bg'}`}>
                    {isSelected && <Check size={12} className=": text-foreground" />}
                </div>
                <h4 className="font-bold text-foreground text-sm">{style.name}</h4>
            </div>
            {style.description && (
                <p className="text-xs text-text-secondary mb-2">{style.description}</p>
            )}
            <div className="text-[10px] text-text-muted truncate">
                {style.positive_prompt.substring(0, 50)}...
            </div>
        </motion.div>
    );
}

function StyleEditor({ name, positivePrompt, negativePrompt, onNameChange, onPositiveChange, onNegativeChange, onSaveCustom, selectedStyle, readOnly = false }: any) {
    const ta = useTranslations("artDirection");
    const inputClass = readOnly
        ? "w-full bg-glass border border-glass-border rounded-lg p-3 text-sm text-text-secondary placeholder-text-muted cursor-default opacity-80"
        : "w-full bg-glass border border-glass-border rounded-lg p-3 text-sm text-foreground placeholder-text-muted focus:border-primary focus:outline-none";
    const textareaClass = readOnly
        ? "w-full bg-input-bg border border-glass-border rounded-lg p-3 text-sm text-text-secondary placeholder-text-muted resize-none cursor-default opacity-80"
        : "w-full bg-input-bg border border-glass-border rounded-lg p-3 text-sm text-foreground placeholder-text-muted focus:border-primary focus:outline-none resize-none";
    return (
        <div className="space-y-6">
            {!selectedStyle && (
                <div className="text-sm text-text-muted italic">
                    {ta("selectStyleHint")}
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                    {ta("styleName")}
                </label>
                <input
                    type="text"
                    value={name}
                    readOnly={readOnly}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder={ta("styleNamePlaceholder")}
                    className={inputClass}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                    {ta("positivePrompt")}
                </label>
                <textarea
                    value={positivePrompt}
                    readOnly={readOnly}
                    onChange={(e) => onPositiveChange(e.target.value)}
                    placeholder={ta("positivePromptPlaceholder")}
                    rows={6}
                    className={textareaClass}
                />
                <p className="text-xs text-text-muted mt-1">
                    {ta("positivePromptHint")}
                </p>
            </div>

            <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                    {ta("negativePrompt")}
                </label>
                <textarea
                    value={negativePrompt}
                    readOnly={readOnly}
                    onChange={(e) => onNegativeChange(e.target.value)}
                    placeholder={ta("negativePromptPlaceholder")}
                    rows={4}
                    className={textareaClass}
                />
                <p className="text-xs text-text-muted mt-1">
                    {ta("negativePromptHint")}
                </p>
            </div>

            <div className="pt-4 border-t border-glass-border">
                <button
                    onClick={onSaveCustom}
                    disabled={readOnly || !name || !positivePrompt}
                    className="w-full px-4 py-2 bg-hover-bg hover:bg-hover-bg text-foreground text-sm rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <Plus size={14} />
                    {ta("saveAsCustom")}
                </button>
            </div>

            {/* Preview */}
            {positivePrompt && (
                <div className="bg-surface border border-glass-border rounded-lg p-4">
                    <p className="text-xs text-text-muted mb-2">{ta("previewLabel")}</p>
                    <p className="text-xs text-blue-400 font-mono">
                        &quot;{positivePrompt}, [user description]&quot;
                    </p>
                </div>
            )}
        </div>
    );
}
