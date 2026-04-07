"use client";

import { useState, useEffect } from "react";

const ADMIN_KEY = "waterflow-admin";

export function useAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Check URL param first — ?admin enables, ?admin=off disables
    const params = new URLSearchParams(window.location.search);
    if (params.has("admin")) {
      const val = params.get("admin");
      if (val === "off" || val === "0" || val === "false") {
        localStorage.removeItem(ADMIN_KEY);
        setIsAdmin(false);
      } else {
        localStorage.setItem(ADMIN_KEY, "1");
        setIsAdmin(true);
      }
      // Clean the URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("admin");
      window.history.replaceState({}, "", url.pathname + url.search);
      return;
    }

    // Otherwise read from localStorage
    setIsAdmin(localStorage.getItem(ADMIN_KEY) === "1");
  }, []);

  return isAdmin;
}
