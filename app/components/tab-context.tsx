"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { StatusFilter } from "./filter-chips";

export type ClassFilter = "all" | "I" | "II" | "III" | "IV" | "V";

export type TabId = "my-rivers" | "explore" | "map" | "chat";

const TAB_STORAGE_KEY = "waterflow-active-tab";
const FAVORITES_STORAGE_KEY = "waterflow-favorites";

interface TabContextValue {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (filter: StatusFilter) => void;
  classFilter: ClassFilter;
  setClassFilter: (filter: ClassFilter) => void;
  timeTravelTs: number | null;
  setTimeTravelTs: (ts: number | null) => void;
}

const TabContext = createContext<TabContextValue | null>(null);

function getInitialTab(): TabId {
  if (typeof window === "undefined") return "my-rivers";
  try {
    // Check saved tab preference
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    if (
      saved === "my-rivers" ||
      saved === "explore" ||
      saved === "map" ||
      saved === "chat"
    ) {
      return saved;
    }
    // First launch: if no favorites, start on Explore
    const favRaw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    const favs = favRaw ? JSON.parse(favRaw) : [];
    return favs.length === 0 ? "explore" : "my-rivers";
  } catch {
    return "my-rivers";
  }
}

export function TabProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTabState] = useState<TabId>("my-rivers");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [classFilter, setClassFilter] = useState<ClassFilter>("all");
  const [timeTravelTs, setTimeTravelTs] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setActiveTabState(getInitialTab());
    setMounted(true);
  }, []);

  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  }, []);

  // Prevent flash of wrong tab before hydration
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <TabContext.Provider
      value={{
        activeTab,
        setActiveTab,
        statusFilter,
        setStatusFilter,
        classFilter,
        setClassFilter,
        timeTravelTs,
        setTimeTravelTs,
      }}
    >
      {children}
    </TabContext.Provider>
  );
}

export function useTab(): TabContextValue {
  const ctx = useContext(TabContext);
  if (!ctx) {
    // Fallback for pre-mount render
    return {
      activeTab: "my-rivers",
      setActiveTab: () => {},
      statusFilter: "all",
      setStatusFilter: () => {},
      classFilter: "all",
      setClassFilter: () => {},
      timeTravelTs: null,
      setTimeTravelTs: () => {},
    };
  }
  return ctx;
}
