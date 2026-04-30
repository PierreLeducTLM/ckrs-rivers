"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

const FIELD_OPTIONS = [
  "paddling_levels",
  "put_in_take_out",
  "river_path",
  "rapid_class",
  "description",
  "coordinates",
  "other",
] as const;

const FIELD_TRANSLATION_KEY: Record<(typeof FIELD_OPTIONS)[number], string> = {
  paddling_levels: "feedback.fields.paddlingLevels",
  put_in_take_out: "feedback.fields.putInTakeOut",
  river_path: "feedback.fields.riverPath",
  rapid_class: "feedback.fields.rapidClass",
  description: "feedback.fields.description",
  coordinates: "feedback.fields.coordinates",
  other: "feedback.fields.other",
};

interface FeedbackModalProps {
  onClose: () => void;
  stationId?: string;
  stationName?: string;
}

export default function FeedbackModal({ onClose, stationId, stationName }: FeedbackModalProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [field, setField] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const isContextual = !!stationId;

  useEffect(() => {
    messageRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: isContextual ? "river_config" : "general",
          stationId: stationId ?? undefined,
          field: isContextual && field ? field : undefined,
          message: message.trim(),
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t("feedback.errorGeneric"));
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : t("feedback.errorGeneric"));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold">{t("feedback.successTitle")}</h3>
            <p className="mt-2 text-sm text-foreground/60">{t("feedback.success")}</p>
            <button
              onClick={onClose}
              className="mt-4 rounded-lg bg-foreground/10 px-4 py-2 text-sm font-medium hover:bg-foreground/15"
            >
              {t("feedback.done")}
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h3 className="text-lg font-semibold">{t("feedback.title")}</h3>
              <p className="mt-1 text-sm text-foreground/60">{t("feedback.description")}</p>
            </div>

            {isContextual && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                {t("feedback.reportingFor", { name: stationName ?? stationId ?? "" })}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {isContextual && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground/70">
                    {t("feedback.fieldLabel")}
                  </label>
                  <select
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                    className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">{t("feedback.fieldPlaceholder")}</option>
                    {FIELD_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {t(FIELD_TRANSLATION_KEY[value])}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground/70">
                  {t("feedback.messageLabel")}
                </label>
                <textarea
                  ref={messageRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("feedback.messagePlaceholder")}
                  rows={4}
                  maxLength={4000}
                  required
                  className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm placeholder:text-foreground/30 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground/70">
                  {t("feedback.nameLabel")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("feedback.namePlaceholder")}
                  maxLength={200}
                  className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm placeholder:text-foreground/30 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground/70">
                  {t("feedback.emailLabel")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("feedback.emailPlaceholder")}
                  className="w-full rounded-lg border border-foreground/20 bg-transparent px-3 py-2.5 text-sm placeholder:text-foreground/30 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-foreground/40">{t("feedback.emailHint")}</p>
              </div>

              {status === "error" && (
                <p className="text-sm text-red-500">{errorMsg}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg bg-foreground/10 px-4 py-2.5 text-sm font-medium hover:bg-foreground/15"
                >
                  {t("feedback.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {status === "loading" ? t("feedback.sending") : t("feedback.submit")}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
