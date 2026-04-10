"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n/provider";

interface SubscribeModalProps {
  onClose: () => void;
}

export default function SubscribeModal({ onClose }: SubscribeModalProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Subscription failed");
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-sm rounded-xl border border-foreground/10 bg-background p-6 shadow-2xl">
        {status === "success" ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <svg
                className="h-6 w-6 text-blue-600 dark:text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold">{t("subscribe.checkEmail")}</h3>
            <p className="mt-2 text-sm text-foreground/60" dangerouslySetInnerHTML={{ __html: t("subscribe.confirmationSent", { email }) }} />
            <button
              onClick={onClose}
              className="mt-4 rounded-lg bg-foreground/10 px-4 py-2 text-sm font-medium hover:bg-foreground/15"
            >
              {t("subscribe.done")}
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h3 className="text-lg font-semibold">{t("subscribe.getNotified")}</h3>
              <p className="mt-1 text-sm text-foreground/60">
                {t("subscribe.enterEmail")}
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("subscribe.emailPlaceholder")}
                className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm placeholder:text-foreground/30 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />

              {status === "error" && (
                <p className="mt-2 text-sm text-red-500">{errorMsg}</p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg bg-foreground/10 px-4 py-2.5 text-sm font-medium hover:bg-foreground/15"
                >
                  {t("subscribe.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {status === "loading" ? t("subscribe.sending") : t("subscribe.continue")}
                </button>
              </div>
            </form>

            <p className="mt-3 text-center text-xs text-foreground/40">
              {t("subscribe.unsubscribeAnytime")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
