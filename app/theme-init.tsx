"use client";

import { useLayoutEffect } from "react";

const STORAGE_KEY = "flowcast-theme";

export default function ThemeInit() {
  useLayoutEffect(() => {
    const t = localStorage.getItem(STORAGE_KEY);
    const dark =
      t === "dark" ||
      (t !== "light" && matchMedia("(prefers-color-scheme:dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, []);

  return null;
}
