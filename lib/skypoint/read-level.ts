import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

export type ReadingConfidence = "high" | "medium" | "low" | "unreadable";

export interface ReadLevelInput {
  imageUrl: string;
  scaleDescription: string | null;
  scaleMin: number | null;
  scaleMax: number | null;
  scaleUnit: string | null;
  /**
   * Optional per-camera annotated reference frame (boxes/arrows marking where
   * the scale is). When present it's shown to the model first, purely to help
   * it locate the scale — the value is still read from the current photo.
   */
  referenceImageUrl?: string | null;
}

export interface ReadLevelResult {
  value: number | null;
  confidence: ReadingConfidence;
  notes: string;
}

const responseSchema = z.object({
  value: z.number().nullable(),
  confidence: z.enum(["high", "medium", "low", "unreadable"]),
  notes: z.string(),
});

const SYSTEM_PROMPT =
  "You read level markings from camera photos. The user gives a photo and a description of the scale, including its valid numeric range and what indicates the current level. In production the indicator is usually the water surface meeting the scale; in test setups the scale description may specify a different indicator (e.g. the top edge of a wooden plank standing in for the water line). The user may also provide an annotated REFERENCE image of the same fixed camera view: use it only to locate the scale and the level indicator — always read the actual value from the current photo, not the reference. Return JSON only.";

function buildUserPrompt(input: ReadLevelInput): string {
  const desc = input.scaleDescription?.trim() || "(no description provided)";
  const range = input.scaleMin != null && input.scaleMax != null
    ? `${input.scaleMin} to ${input.scaleMax}${input.scaleUnit ? ` ${input.scaleUnit}` : ""}`
    : "unknown — answer in the units shown on the scale";

  return [
    `Scale description: ${desc}`,
    `Scale range: ${range}`,
    "",
    "Read the current level where the indicator described in the scale description meets the scale. If no indicator is specified, assume the water surface line.",
    input.scaleMin != null && input.scaleMax != null
      ? `The "value" must be a number between ${input.scaleMin} and ${input.scaleMax} (inclusive), or null if the scale or the level indicator is not clearly visible.`
      : 'The "value" must be a number, or null if the scale or the level indicator is not clearly visible.',
    "",
    "Use confidence='unreadable' (and value=null) if the scale is obscured, dark, snowed over, or the indicator position is ambiguous. Keep notes short (one sentence).",
  ].join("\n");
}

export async function readLevel(input: ReadLevelInput): Promise<ReadLevelResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      value: null,
      confidence: "unreadable",
      notes: "ANTHROPIC_API_KEY missing — vision reader skipped",
    };
  }

  const referenceUrl = input.referenceImageUrl?.trim() || null;

  // With a reference: show the annotated guide first (labelled), then the
  // current photo, then the prompt. Without: today's exact single-image path.
  const userContent = referenceUrl
    ? ([
        {
          type: "text",
          text: "REFERENCE — annotated guide showing where/how to read the scale on this fixed camera (boxes/arrows mark the scale and the level indicator). Do not read the value from this image.",
        },
        { type: "image", image: new URL(referenceUrl) },
        { type: "text", text: "CURRENT PHOTO to read:" },
        { type: "image", image: new URL(input.imageUrl) },
        { type: "text", text: buildUserPrompt(input) },
      ] as const)
    : ([
        { type: "image", image: new URL(input.imageUrl) },
        { type: "text", text: buildUserPrompt(input) },
      ] as const);

  try {
    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-5"),
      schema: responseSchema,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [...userContent],
        },
      ],
    });

    let { value, confidence, notes } = object;

    if (value != null && input.scaleMin != null && input.scaleMax != null) {
      if (value < input.scaleMin || value > input.scaleMax) {
        notes = `${notes} (model returned ${value} outside scale range ${input.scaleMin}..${input.scaleMax} — clamped)`;
        value = Math.max(input.scaleMin, Math.min(input.scaleMax, value));
        if (confidence === "high") confidence = "medium";
      }
    }

    return { value, confidence, notes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { value: null, confidence: "unreadable", notes: `Vision call failed: ${msg}` };
  }
}
