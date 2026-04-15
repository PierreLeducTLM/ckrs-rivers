"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

import { useTranslation } from "@/lib/i18n/provider";
import ChatRiverCard, {
  extractCardsFromToolOutput,
  type ChatCardInput,
} from "./chat-river-card";

const FAVORITES_KEY = "waterflow-favorites";

interface UserLocation {
  lat: number;
  lon: number;
}

function readFavoriteIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

/**
 * Request browser geolocation with a short timeout.
 * Returns null if the user denies or if geolocation is unavailable.
 */
function requestLocation(): Promise<UserLocation | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

export default function ChatTab() {
  const { t, locale } = useTranslation();

  // Load favorites + location once on mount. Both feed the POST body.
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const favoritesRef = useRef<string[]>([]);
  const locationRef = useRef<UserLocation | null>(null);
  const localeRef = useRef<"en" | "fr">(locale);

  useEffect(() => {
    const favs = readFavoriteIds();
    setFavoriteIds(favs);
    favoritesRef.current = favs;

    const onFavoritesChanged = () => {
      const updated = readFavoriteIds();
      setFavoriteIds(updated);
      favoritesRef.current = updated;
    };
    window.addEventListener("favorites-changed", onFavoritesChanged);

    requestLocation().then((loc) => {
      setUserLocation(loc);
      locationRef.current = loc;
    });

    return () => window.removeEventListener("favorites-changed", onFavoritesChanged);
  }, []);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  // Transport with a function-style body so every request reflects the latest
  // favorites / location / locale. The body callback reads refs at send-time,
  // not render-time — `react-hooks/refs` can't tell the difference here, so
  // we silence it for this memo block.
  /* eslint-disable react-hooks/refs */
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          favoriteIds: favoritesRef.current,
          userLat: locationRef.current?.lat,
          userLon: locationRef.current?.lon,
          locale: localeRef.current,
        }),
      }),
    [],
  );
  /* eslint-enable react-hooks/refs */

  const { messages, sendMessage, status, stop, error } = useChat({ transport });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to the latest message after each update. useLayoutEffect avoids
  // flicker during streaming.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const isBusy = status === "submitted" || status === "streaming";

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusy) return;
      sendMessage({ text: trimmed });
      setInput("");
    },
    [sendMessage, isBusy],
  );

  const onStarterClick = useCallback(
    (key: string) => {
      submit(t(key));
    },
    [submit, t],
  );

  const starters = [
    "chat.starter1",
    "chat.starter2",
    "chat.starter3",
    "chat.starter4",
  ];

  return (
    <div className="flex flex-col gap-3 pb-16">
      {/* Header strip */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{t("chat.title")}</h2>
          <p className="text-xs text-foreground/50">{t("chat.subtitle")}</p>
        </div>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          {t("chat.experimental")}
        </span>
      </div>

      {/* Location hint */}
      <div className="flex items-center gap-1.5 text-[11px] text-foreground/50">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
        <span>{userLocation ? t("chat.locationGranted") : t("chat.locationDenied")}</span>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex min-h-[240px] flex-col gap-3 overflow-y-auto rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3"
        style={{ maxHeight: "calc(100dvh - 16rem)" }}
      >
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-start justify-start gap-3 py-4">
            <h3 className="text-sm font-semibold text-foreground/80">
              {t("chat.emptyHeading")}
            </h3>
            <p className="text-xs text-foreground/50">{t("chat.emptySubtext")}</p>
            <div className="flex flex-col gap-2 w-full">
              {starters.map((key) => (
                <button
                  key={key}
                  onClick={() => onStarterClick(key)}
                  className="rounded-lg border border-foreground/10 bg-background px-3 py-2 text-left text-xs text-foreground/80 transition hover:border-brand/40 hover:bg-brand/5"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            assistantLabel={t("chat.assistantLabel")}
            locale={locale}
          />
        ))}

        {status === "submitted" && (
          <div className="text-xs italic text-foreground/50">{t("chat.thinking")}</div>
        )}

        {error && (
          <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            {t("chat.error")}
          </div>
        )}
      </div>

      {/* Composer pinned above bottom nav. Bottom nav content is ~56px tall
          plus safe-area; we stack above that. */}
      <div
        className="fixed inset-x-0 z-30 border-t border-foreground/10 bg-background/95 backdrop-blur-md"
        style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <form
          className="mx-auto flex max-w-lg items-center gap-2 px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("chat.placeholder")}
            className="flex-1 rounded-full border border-foreground/15 bg-foreground/5 px-4 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            disabled={isBusy}
          />
          {isBusy ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-full bg-foreground/15 px-4 py-2 text-xs font-medium hover:bg-foreground/20"
            >
              {t("chat.stop")}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-brand-foreground disabled:opacity-50"
            >
              {t("chat.send")}
            </button>
          )}
        </form>
      </div>

      {/* Spacer so the last message isn't hidden behind the composer */}
      <div className="h-20" />

      {/* Favorites hint (debug-y, small) */}
      {favoriteIds.length > 0 && (
        <p className="text-[10px] text-foreground/30">
          {favoriteIds.length} favorite{favoriteIds.length === 1 ? "" : "s"} visible to the assistant
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

interface MessageBubbleProps {
  message: UIMessage;
  assistantLabel: string;
  locale: "en" | "fr";
}

/**
 * Assistant messages may contain a mix of text parts and tool-call parts.
 * We walk them in arrival order and emit one of three block types:
 *  - text: buffered consecutive text parts (rendered as a bubble)
 *  - cards: an array of river cards extracted from a completed tool call
 *  - tool-indicator: a small status line while a tool call is in flight
 */
type Block =
  | { kind: "text"; text: string }
  | { kind: "cards"; cards: ChatCardInput[] }
  | { kind: "tool-indicator"; toolName: string; state: string };

function buildBlocks(message: UIMessage): Block[] {
  const blocks: Block[] = [];
  let textBuffer = "";

  const flushText = () => {
    if (textBuffer.length > 0) {
      blocks.push({ kind: "text", text: textBuffer });
      textBuffer = "";
    }
  };

  for (const part of message.parts) {
    if (part.type === "text") {
      textBuffer += (part as { type: "text"; text: string }).text;
      continue;
    }
    if (typeof part.type === "string" && part.type.startsWith("tool-")) {
      const tp = part as { type: string; state: string; output?: unknown };
      flushText();
      if (tp.state === "output-available") {
        const cards = extractCardsFromToolOutput(tp.output);
        if (cards.length > 0) {
          blocks.push({ kind: "cards", cards });
        }
        // If the tool returned nothing card-worthy (error, empty), stay silent —
        // the LLM will comment on it in its text block.
      } else if (tp.state !== "output-error") {
        blocks.push({
          kind: "tool-indicator",
          toolName: tp.type.replace(/^tool-/, ""),
          state: tp.state,
        });
      }
    }
  }
  flushText();
  return blocks;
}

function MessageBubble({ message, assistantLabel, locale }: MessageBubbleProps) {
  if (message.role === "system") return null;

  const isUser = message.role === "user";

  if (isUser) {
    const text = message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join("");
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl bg-brand px-3 py-2 text-sm text-brand-foreground">
          {text}
        </div>
      </div>
    );
  }

  const blocks = buildBlocks(message);
  const hasAnyContent = blocks.length > 0;

  return (
    <div className="flex w-full flex-col items-start gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-brand">
        {assistantLabel}
      </span>
      {!hasAnyContent && (
        <div className="rounded-2xl border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground/50">
          …
        </div>
      )}
      {blocks.map((block, i) => {
        if (block.kind === "text") {
          return (
            <div
              key={i}
              className="max-w-[95%] whitespace-pre-wrap rounded-2xl border border-foreground/10 bg-background px-3 py-2 text-sm text-foreground"
            >
              {block.text}
            </div>
          );
        }
        if (block.kind === "cards") {
          return (
            <div key={i} className="flex w-full flex-col gap-1.5">
              {block.cards.map((card) => (
                <ChatRiverCard key={card.id} data={card} locale={locale} />
              ))}
            </div>
          );
        }
        return (
          <ToolCallIndicator
            key={i}
            toolName={block.toolName}
            state={block.state}
          />
        );
      })}
    </div>
  );
}

function ToolCallIndicator({
  toolName,
  state,
}: {
  toolName: string;
  state: string;
}) {
  return (
    <div className="flex items-center gap-1.5 pl-1 text-[11px] text-foreground/50">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      <code className="font-mono">{toolName}</code>
      <span>· {state}</span>
    </div>
  );
}
