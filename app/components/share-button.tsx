"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";

type ShareKind = "river" | "put-in" | "take-out";

interface ShareButtonProps {
  stationId: string;
  stationName: string;
  kind?: ShareKind;
  className?: string;
  iconClassName?: string;
  label?: string;
}

function buildShareUrl(stationId: string, kind: ShareKind): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://www.flowcast.ca";
  const params = new URLSearchParams({ ref: "share", ts: String(Date.now()) });
  if (kind === "river") {
    return `${origin}/rivers/${stationId}?${params.toString()}`;
  }
  // Point shares use a dedicated /go route that unfurls a FlowCast OG card
  // and redirects the user to their maps app on tap.
  return `${origin}/go/${stationId}/${kind}?${params.toString()}`;
}

async function nativeShare(args: {
  title: string;
  text: string;
  url: string;
  dialogTitle: string;
}): Promise<"native" | "web" | "copied"> {
  // Try Capacitor Share first (works on iOS/Android native)
  try {
    const cap = await import("@capacitor/core");
    if (cap.Capacitor.isNativePlatform()) {
      const { Share } = await import("@capacitor/share");
      await Share.share(args);
      return "native";
    }
  } catch {
    // Capacitor not available — fall through to Web Share API
  }

  // Web Share API
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: args.title, text: args.text, url: args.url });
      return "web";
    } catch (err) {
      // User aborted — re-throw so caller can stay open
      if ((err as Error)?.name === "AbortError") throw err;
      // Other failures fall through to clipboard
    }
  }

  // Clipboard fallback
  const payload = args.text ? `${args.text}\n${args.url}` : args.url;
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(payload);
  }
  return "copied";
}

export default function ShareButton({
  stationId,
  stationName,
  kind = "river",
  className,
  iconClassName,
  label,
}: ShareButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset transient state when sheet closes
  useEffect(() => {
    if (!open) {
      setCopied(false);
      setBusy(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const ariaLabel =
    label ??
    (kind === "put-in"
      ? t("share.putIn")
      : kind === "take-out"
        ? t("share.takeOut")
        : t("share.river"));

  const titleKey =
    kind === "put-in"
      ? "share.shareTitlePutIn"
      : kind === "take-out"
        ? "share.shareTitleTakeOut"
        : "share.shareTitleRiver";

  async function handleShare() {
    setBusy(true);
    try {
      const result = await nativeShare({
        title: t(titleKey, { name: stationName }),
        text: message.trim(),
        url: buildShareUrl(stationId, kind),
        dialogTitle: t("share.dialogTitle"),
      });
      if (result === "copied") {
        setCopied(true);
        setTimeout(() => setOpen(false), 1200);
      } else {
        setOpen(false);
      }
    } catch {
      // User aborted system share sheet — keep dialog open
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    const url = buildShareUrl(stationId, kind);
    const payload = message.trim() ? `${message.trim()}\n${url}` : url;
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          className ??
          "rounded p-0.5 transition-colors hover:scale-110"
        }
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        <svg
          className={iconClassName ?? "h-5 w-5 text-foreground/30 hover:text-foreground/60"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
          />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl dark:bg-zinc-900 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {t("share.title")}
            </h3>

            <label className="mt-4 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {t("share.messageLabel")}
            </label>
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("share.messagePlaceholder")}
              rows={3}
              className="mt-1 block w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder-zinc-500"
            />

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {copied ? t("share.copied") : t("share.copyLink")}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {t("share.cancel")}
              </button>
              <button
                type="button"
                onClick={handleShare}
                disabled={busy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("share.send")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
