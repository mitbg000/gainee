/**
 * AI task routing: each feature can use its own provider + model,
 * e.g. a cheap model for quick reader questions and a strong one for writing feedback.
 * Stored in settings under "ai.routing". Edited on the Settings page (Phase 1).
 */
export const AI_TASKS = [
  "lesson_generate", // build lessons from an imported text
  "reader_quick", // quick questions in the reader side panel (word, sentence, grammar, translate)
  "writing_grade", // IELTS writing feedback
  "chat", // free conversation about a text
] as const;
export type AiTask = (typeof AI_TASKS)[number];

export type AiRoute = {
  providerId: number;
  model: string;
  temperature?: number;
  /** Optional backup used automatically if the main provider fails. */
  fallback?: { providerId: number; model: string };
};

export type AiRouting = Partial<Record<AiTask, AiRoute>>;

/** Built-in provider presets – all speak the OpenAI-compatible chat API. Verify model names when configuring. */
export const PROVIDER_PRESETS = {
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  openai: { label: "OpenAI (ChatGPT)", baseUrl: "https://api.openai.com/v1" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  xai: { label: "xAI (Grok)", baseUrl: "https://api.x.ai/v1" },
  custom: { label: "Custom (OpenAI-compatible)", baseUrl: "" },
} as const;

/** Pictures for hard Writing Task 1 forms (processes, technical diagrams, maps). Stored in settings under "ai.images". */
export type ImageSetting = { enabled: boolean; providerId: number; model: string };
