/**
 * Experimental chat endpoint — streams a Claude response grounded in the
 * river catalog and forecast data.
 *
 * POST body (from useChat + DefaultChatTransport):
 *   {
 *     messages: UIMessage[],     // from useChat
 *     favoriteIds?: string[],    // client-side favorites (localStorage)
 *     userLat?: number,          // browser geolocation (if granted)
 *     userLon?: number,
 *     locale?: "en" | "fr",
 *   }
 */

import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { chatTools } from "@/lib/ai/tools";
import { buildSystemMessages } from "@/lib/ai/system-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RequestBody {
  messages: UIMessage[];
  favoriteIds?: string[];
  userLat?: number;
  userLon?: number;
  locale?: "en" | "fr";
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Chat is not configured — ANTHROPIC_API_KEY is missing." },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    messages = [],
    favoriteIds = [],
    userLat,
    userLon,
    locale = "fr",
  } = body;

  const userLocation =
    typeof userLat === "number" && typeof userLon === "number"
      ? { lat: userLat, lon: userLon }
      : null;

  try {
    const system = await buildSystemMessages({
      locale,
      favoriteIds,
      userLocation,
      now: new Date(),
    });

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model: anthropic("claude-sonnet-4-5"),
      system,
      messages: modelMessages,
      tools: chatTools,
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error("[/api/chat] Unhandled error:", err);
    return Response.json(
      { error: "Chat failed — please try again." },
      { status: 500 },
    );
  }
}
