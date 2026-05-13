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
  "You read water-level scales from outdoor camera photos. The user gives a photo and a description of the scale, including its valid numeric range. Return JSON only.";

function buildUserPrompt(input: ReadLevelInput): string {
  const desc = input.scaleDescription?.trim() || "(no description provided)";
  const range = input.scaleMin != null && input.scaleMax != null
    ? `${input.scaleMin} to ${input.scaleMax}${input.scaleUnit ? ` ${input.scaleUnit}` : ""}`
    : "unknown — answer in the units shown on the scale";

  return [
    `Scale description: ${desc}`,
    `Scale range: ${range}`,
    "",
    "Read the current water level where the water surface meets the scale.",
    input.scaleMin != null && input.scaleMax != null
      ? `The "value" must be a number between ${input.scaleMin} and ${input.scaleMax} (inclusive), or null if the scale or water line is not clearly visible.`
      : 'The "value" must be a number, or null if the scale or water line is not clearly visible.',
    "",
    "Use confidence='unreadable' (and value=null) if the scale is obscured, dark, snowed over, or the water line is ambiguous. Keep notes short (one sentence).",
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

  try {
    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-5"),
      schema: responseSchema,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image", image: new URL(input.imageUrl) },
            { type: "text", text: buildUserPrompt(input) },
          ],
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
