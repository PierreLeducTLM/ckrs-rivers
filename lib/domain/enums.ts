import { z } from "zod";

// --- Flow Reading ---

export const FlowReadingSourceSchema = z.enum(["gauge", "manual", "estimated"]);
export type FlowReadingSource = z.infer<typeof FlowReadingSourceSchema>;

export const QualityFlagSchema = z.enum(["verified", "provisional", "estimated"]);
export type QualityFlag = z.infer<typeof QualityFlagSchema>;

// --- River Station ---

export const RiverBedTypeSchema = z.enum(["bedrock", "gravel", "sand"]);
export type RiverBedType = z.infer<typeof RiverBedTypeSchema>;

export const OrientationSchema = z.enum([
  "north",
  "south",
  "east",
  "west",
  "northeast",
  "northwest",
  "southeast",
  "southwest",
]);
export type Orientation = z.infer<typeof OrientationSchema>;

// --- Paddling ---

export const SkillLevelSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
  "expert",
]);
export type SkillLevel = z.infer<typeof SkillLevelSchema>;

// --- Weather ---

export const WindDirectionSchema = z.enum([
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
]);
export type WindDirection = z.infer<typeof WindDirectionSchema>;
