"use client";

/**
 * UpdateChecker — 关于页「检查更新」(Phase 2 设置规格 §B ⑥b)。
 *
 * 纯前端、自包含、无 props：SettingsPage 直接 <UpdateChecker /> 渲染即可。
 * 手动按钮 → 拉取个人仓库 main 分支最新提交(未授权,限流 ~60/hr)→
 * 与构建提交比对 → 有变化仅提示并打开提交页(绝不自更新)。
 *
 * 主题:仅语义 token(primary=teal 动作/链接,accent=amber 提示),
 * 状态文案用 text-text-secondary / text-text-muted。无硬编码色 / 无 white-alpha。
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, Loader2, Check, Sparkles, ExternalLink, CircleAlert } from "lucide-react";

const DEFAULT_REPOSITORY = "paulyan678/lumenx";
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const configuredRepository = process.env.NEXT_PUBLIC_UPDATE_REPOSITORY?.trim();

export const UPDATE_REPOSITORY =
  configuredRepository && REPOSITORY_PATTERN.test(configuredRepository)
    ? configuredRepository
    : DEFAULT_REPOSITORY;
export const UPDATE_BRANCH = "main";
export const LATEST_COMMIT_API = `https://api.github.com/repos/${UPDATE_REPOSITORY}/commits/${UPDATE_BRANCH}`;
export const COMMITS_URL = `https://github.com/${UPDATE_REPOSITORY}/commits/${UPDATE_BRANCH}`;

const BUILD_COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT?.trim() || "";

type Status = "idle" | "checking" | "latest" | "update" | "error";

function normalizeCommit(value: string): string {
  return value.trim().toLowerCase();
}

/** Accept full or abbreviated SHAs when comparing the build with GitHub. */
export function commitsMatch(remote: string, current: string): boolean {
  const remoteCommit = normalizeCommit(remote);
  const currentCommit = normalizeCommit(current);
  return Boolean(
    remoteCommit &&
      currentCommit &&
      (remoteCommit.startsWith(currentCommit) || currentCommit.startsWith(remoteCommit)),
  );
}

type UpdateCheckerProps = {
  currentCommit?: string;
};

export default function UpdateChecker({ currentCommit = BUILD_COMMIT }: UpdateCheckerProps) {
  const t = useTranslations("settings");
  const [status, setStatus] = useState<Status>("idle");
  const [remoteCommit, setRemoteCommit] = useState("");
  const [commitUrl, setCommitUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState(() => t("updateError"));

  const checking = status === "checking";

  const openChanges = (url?: string) =>
    window.open(url || COMMITS_URL, "_blank", "noopener,noreferrer");

  const handleCheck = async () => {
    setStatus("checking");
    setErrorMsg(t("updateError"));
    if (!normalizeCommit(currentCommit)) {
      setErrorMsg(t("updateBuildUnknown"));
      setStatus("error");
      return;
    }
    try {
      const res = await fetch(LATEST_COMMIT_API, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = await res.json();
      const sha: string = typeof data?.sha === "string" ? data.sha.trim() : "";
      const url: string = typeof data?.html_url === "string" ? data.html_url : "";
      if (!sha) {
        setStatus("error");
        return;
      }
      setRemoteCommit(sha.slice(0, 7));
      setCommitUrl(url);
      setStatus(commitsMatch(sha, currentCommit) ? "latest" : "update");
    } catch {
      setStatus("error");
    }
  };

  // 状态文案颜色:中性信息 secondary / 低调错误 muted / 新版用 accent(amber)。
  const statusColor =
    status === "update"
      ? "text-accent"
      : status === "error"
        ? "text-text-muted"
        : "text-text-secondary";

  const showOpenButton = status === "update" || status === "error";

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap py-2.5 border-t border-glass-border text-[0.78125rem]">
      <span className="text-text-secondary shrink-0">{t("updateLabel")}</span>

      <div className="flex items-center gap-2.5 flex-wrap justify-end">
        {/* 结果区:屏幕阅读器实时播报 */}
        <span
          role="status"
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 font-mono text-[0.71875rem] ${statusColor}`}
        >
          {status === "latest" && (
            <>
              <Check size={13} />
              {t("updateUpToDate", { commit: remoteCommit })}
            </>
          )}
          {status === "update" && (
            <>
              <Sparkles size={13} />
              {t("updateNewVersion", { commit: remoteCommit })}
            </>
          )}
          {status === "error" && (
            <>
              <CircleAlert size={13} />
              {errorMsg}
            </>
          )}
        </span>

        {showOpenButton && (
          <button
            type="button"
            onClick={() => openChanges(status === "update" ? commitUrl : undefined)}
            className="inline-flex items-center gap-1 text-primary hover:underline text-[0.75rem] font-medium"
            aria-label={t("updateOpenCommitAria")}
          >
            {t("updateOpenCommit")}
            <ExternalLink size={12} />
          </button>
        )}

        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          aria-label={t("updateCheckAria")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-glass-border text-primary hover:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-[0.75rem] font-medium"
        >
          {checking ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
          {checking ? t("updateChecking") : t("updateCheck")}
        </button>
      </div>
    </div>
  );
}
