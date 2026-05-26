"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Palette, Wand2, Plus, Check, Loader2, ChevronRight, Lock, RotateCcw, ArrowUp } from "lucide-react";
import { useProjectStore, type StyleConfig, type StylePreset } from "@/store/projectStore"; // Combined imports
import { api } from "@/lib/api";
import StepHeader from "@/components/shared/StepHeader";
import WorkflowActionButton from "@/components/shared/WorkflowActionButton";
import SidePanelHeader from "@/components/shared/SidePanelHeader";

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

    // R2V v2 Phase 2: series-level inherit/override state.
    // Fetch series baseline on mount/whenever project changes; track local
    // unlock for the "解锁编辑" affordance.
    const [seriesBaseline, setSeriesBaseline] = useState<StyleConfig | null>(null);
    const [seriesBaselineLoading, setSeriesBaselineLoading] = useState(false);
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [bannerBusy, setBannerBusy] = useState(false);

    useEffect(() => {
        // Reset unlock state when switching projects
        setIsUnlocked(false);
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

    // Inherit-state derivation (project relative to series baseline)
    const projectStyle = currentProject?.art_direction?.style_config ?? null;
    const inSeries = !!currentProject?.series_id;
    const isInherit = inSeries && !!seriesBaseline && !projectStyle;
    const isOverridden = inSeries && !!seriesBaseline && !!projectStyle;
    const canPromote = inSeries && !seriesBaseline && !!projectStyle;
    const editorLocked = isInherit && !isUnlocked;

    const handleUnlock = () => setIsUnlocked(true);

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
            setIsUnlocked(false);
        } catch (err) {
            console.error("Reset to series baseline failed", err);
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
            alert(ta("analysisFailed"));
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

    const handleSelectStyle = (style: StyleConfig | StylePreset) => {
        const normalizedStyle = toStyleConfig(style);
        setSelectedStyle(normalizedStyle);
        setEditingName(normalizedStyle.name);
        setEditingPositive(normalizedStyle.positive_prompt);
        setEditingNegative(normalizedStyle.negative_prompt);
    };

    const handleSaveCustom = async () => {
        if (!editingName || !editingPositive) {
            alert(ta("fillNameAndPrompt"));
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
                alert(ta("customStyleSaved"));
            } catch (error) {
                console.error("Failed to save custom style:", error);
                alert(ta("saveFailed"));
            }
        }
    };

    const handleApply = async () => {
        if (!currentProject || !selectedStyle) {
            alert(ta("selectStyleFirst"));
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
            alert(ta("styleApplied"));
        } catch (error) {
            console.error("Failed to save art direction:", error);
            alert(ta("saveFailedShort"));
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
                    {/* R2V v2 Phase 2: inherit / override / promote banner */}
                    {inSeries && !seriesBaselineLoading && (
                        <>
                            {isInherit && (
                                <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
                                    <Lock size={16} className="text-primary shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-foreground">
                                            <span className="text-text-secondary">{ta("inheritsBaseline")}</span>{" "}
                                            <span className="font-medium">{seriesBaseline?.name}</span>
                                        </p>
                                        <p className="text-[11px] text-text-muted mt-0.5">{ta("inheritHint")}</p>
                                    </div>
                                    {editorLocked && (
                                        <WorkflowActionButton variant="secondary" size="sm" onClick={handleUnlock}>
                                            {ta("unlockEdit")}
                                        </WorkflowActionButton>
                                    )}
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

            {/* Right: independent Style Editor panel — floor-to-ceiling */}
            <div className="w-[360px] shrink-0 flex flex-col bg-surface border-l border-glass-border overflow-hidden">
                <SidePanelHeader
                    icon={<Palette />}
                    title={ta("styleEditor")}
                    subtitle={selectedStyle?.name ?? ta("selectStyleHint")}
                />
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
                    />
                </div>
            </div>
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

function StyleEditor({ name, positivePrompt, negativePrompt, onNameChange, onPositiveChange, onNegativeChange, onSaveCustom, selectedStyle }: any) {
    const ta = useTranslations("artDirection");
    return (
        <div className="space-y-6">
            {/* 标题已经在外层 SidePanelHeader 渲染，此处不再重复。
                empty-state 提示移到表单上方，省去一层 div 包装。 */}
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
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder={ta("styleNamePlaceholder")}
                    className="w-full bg-glass border border-glass-border rounded-lg p-3 text-sm text-foreground placeholder-text-muted focus:border-primary focus:outline-none"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                    {ta("positivePrompt")}
                </label>
                <textarea
                    value={positivePrompt}
                    onChange={(e) => onPositiveChange(e.target.value)}
                    placeholder={ta("positivePromptPlaceholder")}
                    rows={6}
                    className="w-full bg-input-bg border border-glass-border rounded-lg p-3 text-sm text-foreground placeholder-text-muted focus:border-primary focus:outline-none resize-none"
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
                    onChange={(e) => onNegativeChange(e.target.value)}
                    placeholder={ta("negativePromptPlaceholder")}
                    rows={4}
                    className="w-full bg-input-bg border border-glass-border rounded-lg p-3 text-sm text-foreground placeholder-text-muted focus:border-primary focus:outline-none resize-none"
                />
                <p className="text-xs text-text-muted mt-1">
                    {ta("negativePromptHint")}
                </p>
            </div>

            <div className="pt-4 border-t border-glass-border">
                <button
                    onClick={onSaveCustom}
                    disabled={!name || !positivePrompt}
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
