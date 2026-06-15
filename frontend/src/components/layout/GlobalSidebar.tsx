"use client";

import { useState, useEffect } from "react";
import { LayoutGrid, Layers, Wand2, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { useSettingsStore, type ThemePreset } from "@/store/settingsStore";

export type GlobalTab = "workspace" | "library" | "playground" | "settings";

interface GlobalSidebarProps {
  activeTab: GlobalTab;
  onTabChange: (tab: GlobalTab) => void;
}

// 主导航（顶部）+ settings 单列在底部。图标选用更具表达力的 Line B 风格：
// 工作区=网格画廊 / 主体库=分层资产 / 创作台=创作魔杖。
const NAV_ITEMS: { id: GlobalTab; icon: typeof LayoutGrid; hash: string }[] = [
  { id: "workspace", icon: LayoutGrid, hash: "#/" },
  { id: "library", icon: Layers, hash: "#/library" },
  { id: "playground", icon: Wand2, hash: "#/playground" },
];

// Logo 变体按主题映射（与 LumenXBranding 同源）。
const LOGO_SRC: Record<ThemePreset, string> = {
  "atelier-dark": "/logo-dark.png",
  "bridge-dark": "/logo-dark.png",
  "brand-dark": "/logo-dark.png",
  "atelier-light": "/logo-light-teal.png",
  "brand-light": "/logo-light.png",
};
const ATELIER_DARK_FILTER = "hue-rotate(-64deg) saturate(1.35) brightness(1.08)";

function RailButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      className={clsx(
        "group/item relative w-11 h-11 rounded-xl grid place-items-center transition-all duration-200",
        active
          ? "text-primary bg-primary/10"
          : "text-text-muted hover:text-foreground hover:bg-hover-bg"
      )}
    >
      {/* Active accent bar */}
      {active && (
        <span className="absolute left-[-10px] top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-primary" />
      )}
      {children}
      {/* Hover/focus flyout label (VSCode activity-bar style, floats over content) */}
      <span
        className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 z-50
                   whitespace-nowrap rounded-lg border border-glass-border bg-elevated px-3 py-1.5
                   text-[13px] font-medium text-foreground shadow-xl
                   opacity-0 -translate-x-1 transition-all duration-150
                   group-hover/item:opacity-100 group-hover/item:translate-x-0
                   group-focus-visible/item:opacity-100 group-focus-visible/item:translate-x-0"
      >
        {label}
      </span>
    </button>
  );
}

/**
 * Line B "Luminous Atelier" 全局图标导轨（60px）。
 * 顶部 brand-mark logo + workspace/library/playground 主导航，
 * spacer 把 settings 齿轮压到左下角。悬停/键盘聚焦任意图标浮出全称标签面板，
 * 浮层绝对定位、不挤压主面板布局。结构对所有主题统一，视觉由 token 切换。
 */
export default function GlobalSidebar({ activeTab, onTabChange }: GlobalSidebarProps) {
  const t = useTranslations("nav");
  const theme = useSettingsStore((s) => s.theme);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const activeTheme: ThemePreset = mounted ? theme : "atelier-dark";
  const logoSrc = LOGO_SRC[activeTheme] ?? "/logo-dark.png";
  const logoFilter = activeTheme === "atelier-dark" ? ATELIER_DARK_FILTER : undefined;

  const handleNav = (id: GlobalTab, hash: string) => {
    onTabChange(id);
    window.location.hash = hash;
  };

  return (
    <aside className="w-[60px] flex-shrink-0 h-full flex flex-col items-center py-[18px] gap-2 border-r border-glass-border bg-surface/60 backdrop-blur-xl">
      {/* Brand mark — transparent logo on warm background */}
      <button
        type="button"
        onClick={() => handleNav("workspace", "#/")}
        aria-label="LumenX Studio"
        title="LumenX Studio"
        className="group/item relative w-[38px] h-[38px] grid place-items-center mb-3"
      >
        <img
          src={logoSrc}
          alt="LumenX"
          className="w-[34px] h-[34px] object-contain"
          style={logoFilter ? { filter: logoFilter } : undefined}
        />
        <span
          className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 z-50
                     whitespace-nowrap rounded-lg border border-glass-border bg-elevated px-3 py-1.5
                     font-mono text-[12px] font-semibold tracking-wide text-foreground shadow-xl
                     opacity-0 -translate-x-1 transition-all duration-150
                     group-hover/item:opacity-100 group-hover/item:translate-x-0
                     group-focus-visible/item:opacity-100 group-focus-visible/item:translate-x-0"
        >
          LumenX Studio
        </span>
      </button>

      {/* Primary navigation */}
      <nav className="flex flex-col items-center gap-1.5" aria-label="主导航">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <RailButton
              key={item.id}
              active={activeTab === item.id}
              label={t(item.id)}
              onClick={() => handleNav(item.id, item.hash)}
            >
              <Icon size={20} strokeWidth={1.8} />
            </RailButton>
          );
        })}
      </nav>

      {/* Spacer pushes settings to bottom-left */}
      <div className="flex-1" />

      {/* Settings gear — bottom-left, like mockup */}
      <RailButton
        active={activeTab === "settings"}
        label={t("settings")}
        onClick={() => handleNav("settings", "#/settings")}
      >
        <Settings size={20} strokeWidth={1.8} />
      </RailButton>
    </aside>
  );
}
