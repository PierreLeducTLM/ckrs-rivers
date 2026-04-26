"use client";

import { useTab, type TabId } from "./tab-context";
import { useTranslation } from "@/lib/i18n/provider";

const TABS: { id: TabId; labelKey: string }[] = [
  { id: "my-rivers", labelKey: "tabs.myRivers" },
  { id: "explore", labelKey: "tabs.explore" },
  { id: "map", labelKey: "tabs.map" },
  { id: "chat", labelKey: "tabs.chat" },
];

interface BottomNavProps {
  chatVisible?: boolean;
}

function TabIcon({ id, active }: { id: TabId; active: boolean }) {
  const cls = `h-6 w-6 ${active ? "text-brand" : "text-foreground/40"}`;
  switch (id) {
    case "my-rivers":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
        </svg>
      );
    case "explore":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      );
    case "map":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      );
    case "chat":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
        </svg>
      );
  }
}

export default function BottomNav({ chatVisible = false }: BottomNavProps) {
  const { activeTab, setActiveTab } = useTab();
  const { t } = useTranslation();

  const tabs = chatVisible ? TABS : TABS.filter((tab) => tab.id !== "chat");

  const handleTap = (id: TabId) => {
    if (id === activeTab) {
      // Scroll to top if tapping active tab
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setActiveTab(id);
      window.scrollTo({ top: 0 });
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-foreground/10 bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {tabs.map(({ id, labelKey }) => (
          <button
            key={id}
            onClick={() => handleTap(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 pt-2.5 transition-colors ${
              activeTab === id ? "text-brand" : "text-foreground/40"
            }`}
            aria-label={t(labelKey)}
          >
            <TabIcon id={id} active={activeTab === id} />
            <span className="text-[10px] font-medium">{t(labelKey)}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
