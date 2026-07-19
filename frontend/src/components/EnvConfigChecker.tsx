"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import EnvConfigDialog from "@/components/project/EnvConfigDialog";
import { api } from "@/lib/api";
import {
  configuredSecretFields,
  getNewApiValidationErrors,
  normalizeActiveModel,
} from "@/lib/newApiModels";

export default function EnvConfigChecker() {
  const [isEnvDialogOpen, setIsEnvDialogOpen] = useState(false);
  const [envRequired, setEnvRequired] = useState(false);
  const hasCheckedRef = useRef(false);

  const checkEnvConfig = useCallback(async () => {
    try {
      const config = await api.getEnvConfig();
      const errors = getNewApiValidationErrors(
        config.NEWAPI_BASE_URL ?? "",
        {
          chat: normalizeActiveModel("chat", config.NEWAPI_CHAT_MODEL),
          image: normalizeActiveModel("image", config.NEWAPI_IMAGE_MODEL),
          video: normalizeActiveModel("video", config.NEWAPI_VIDEO_MODEL),
        },
        configuredSecretFields(config as Record<string, unknown>),
      );
      const hasRequired = errors.length === 0;
      
      if (!hasRequired) {
        setEnvRequired(true);
        setIsEnvDialogOpen(true);
      }
    } catch (error) {
      console.error("Failed to check env config:", error);
      // 如果API调用失败，也显示配置对话框
      setEnvRequired(true);
      setIsEnvDialogOpen(true);
    }
  }, []);

  useEffect(() => {
    // 只在客户端执行，且只检查一次
    if (typeof window === "undefined" || hasCheckedRef.current) return;

    hasCheckedRef.current = true;
    void checkEnvConfig();
  }, [checkEnvConfig]);

  return (
    <EnvConfigDialog
      isOpen={isEnvDialogOpen}
      onClose={() => {
        setIsEnvDialogOpen(false);
        setEnvRequired(false);
      }}
      isRequired={envRequired}
    />
  );
}
