import { z } from "zod";
import { getSetting } from "./settings";

/** Learner profile – used to tune AI prompts (vocabulary level, explanation language). */
export const Profile = z.object({
  level: z.enum(["B1", "B2", "C1", "C2"]).default("B2"),
  targetBand: z.number().min(4).max(9).default(7),
  explainIn: z.enum(["vi", "en"]).default("vi"),
  lessonWords: z.number().int().min(300).max(1200).default(650),
});
export type Profile = z.infer<typeof Profile>;

export async function getProfile(): Promise<Profile> {
  return Profile.parse((await getSetting<Partial<Profile>>("profile")) ?? {});
}
