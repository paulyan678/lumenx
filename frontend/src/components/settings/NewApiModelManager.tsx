"use client";

import { Check, CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  APPROVED_NEWAPI_MODELS,
  getApprovedModels,
  type ActiveNewApiSelection,
  type NewApiCapability,
  type NewApiSecretField,
} from "@/lib/newApiModels";
import { FieldLabel, KeyField, settingsInputClass } from "./SettingsControls";

interface NewApiModelManagerProps {
  baseUrl: string;
  active: ActiveNewApiSelection;
  replacements: Partial<Record<NewApiSecretField, string>>;
  configured: Partial<Record<NewApiSecretField, boolean>>;
  onBaseUrlChange: (value: string) => void;
  onActiveChange: (capability: NewApiCapability, modelId: string) => void;
  onSecretChange: (field: NewApiSecretField, value: string) => void;
}

export default function NewApiModelManager({
  baseUrl,
  active,
  replacements,
  configured,
  onBaseUrlChange,
  onActiveChange,
  onSecretChange,
}: NewApiModelManagerProps) {
  const t = useTranslations("settings");
  const activeLabel = {
    chat: t("activeChatModel"),
    image: t("activeImageModel"),
    video: t("activeVideoModel"),
  } as const;

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>NEWAPI_BASE_URL</FieldLabel>
        <input
          type="url"
          value={baseUrl}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          placeholder="https://example.com/v1"
          className={settingsInputClass + " font-mono"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(["chat", "image", "video"] as const).map((capability) => (
          <label key={capability} className="block">
            <FieldLabel>{activeLabel[capability]}</FieldLabel>
            <select
              value={active[capability]}
              onChange={(event) => onActiveChange(capability, event.target.value)}
              className={settingsInputClass}
            >
              {getApprovedModels(capability).map((model) => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-glass-border">
        <div className="hidden grid-cols-[1.1fr_1.4fr_.55fr_.6fr_1.4fr] gap-3 border-b border-glass-border bg-hover-bg px-4 py-2 text-[0.625rem] font-semibold uppercase tracking-wider text-text-muted lg:grid">
          <span>{t("modelDisplayName")}</span>
          <span>{t("providerModelId")}</span>
          <span>{t("capability")}</span>
          <span>{t("configuredStatus")}</span>
          <span>{t("replacementApiKey")}</span>
        </div>
        {APPROVED_NEWAPI_MODELS.map((model) => {
          const isConfigured = configured[model.secretField] === true;
          const isActive = active[model.capability] === model.id;
          return (
            <div
              key={model.id}
              className={`grid gap-3 border-b border-glass-border px-4 py-4 last:border-b-0 lg:grid-cols-[1.1fr_1.4fr_.55fr_.6fr_1.4fr] lg:items-center ${
                isActive ? "bg-primary/5" : "bg-surface"
              }`}
            >
              <div>
                <div className="text-sm font-semibold text-foreground">{model.name}</div>
                <div className="mt-1 text-[0.6875rem] text-text-muted">{model.description}</div>
              </div>
              <code className="break-all text-[0.6875rem] text-text-secondary">{model.id}</code>
              <span className="w-fit rounded-full bg-primary/10 px-2 py-1 text-[0.625rem] font-semibold uppercase text-primary">
                {model.capability}
              </span>
              <div className="space-y-1 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Check size={13} />
                  {t("enabled")}
                </span>
                <span className={`flex items-center gap-1.5 ${isConfigured ? "text-emerald-400" : "text-amber-400"}`}>
                  {isConfigured ? <Check size={13} /> : <CircleAlert size={13} />}
                  {isConfigured ? t("configured") : t("notConfigured")}
                </span>
              </div>
              <div>
                <KeyField
                  value={replacements[model.secretField] ?? ""}
                  onChange={(value) => onSecretChange(model.secretField, value)}
                  placeholder={isConfigured ? t("enterKeyToReplace") : t("enterApiKey")}
                />
                <code className="mt-1 block text-[0.5625rem] text-text-muted">{model.secretField}</code>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[0.6875rem] leading-relaxed text-text-muted">{t("secretStorageHint")}</p>
    </div>
  );
}
