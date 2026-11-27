/**
 * Gainee database schema (MySQL 5.7+/8.0 or MariaDB 10.4+).
 *
 * Tables for later phases are defined up front so the structure stays stable.
 * Conventions:
 *  - JSON is stored through `jsonText` (works on both MySQL JSON and MariaDB LONGTEXT JSON).
 *  - No DEFAULT on TEXT/JSON columns (MySQL 5.7 does not allow it); set them in code.
 *  - All timestamps are UTC DATETIME(3).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  datetime,
  double,
  index,
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  tinyint,
  uniqueIndex,
  varchar,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";

/* ---------- helpers ---------- */
const jsonText = <T>(name: string) =>
  customType<{ data: T; driverData: string }>({
    dataType: () => "json",
    toDriver: (v) => JSON.stringify(v),
    fromDriver: (v) => (typeof v === "string" ? JSON.parse(v) : v) as T,
  })(name);

export type DocumentMeta = { summary?: string; suggestedTopics?: string[]; suggestedSource?: string | null; userTitle?: boolean; dismissed?: boolean };

const pk = () => int("id").autoincrement().primaryKey();
const ts = (name: string) => datetime(name, { mode: "date", fsp: 3 });
const createdAt = () => ts("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const updatedAt = () =>
  ts("updated_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`).$onUpdate(() => new Date());

/* =====================================================================
 * Accounts, roles, credits
 * ===================================================================== */
export const ROLES = ["student", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const users = mysqlTable("users", {
  id: pk(),
  email: varchar("email", { length: 191 }).notNull().unique(), // lower-case; the first admin may be a plain username
  name: varchar("name", { length: 100 }),
  avatar: varchar("avatar", { length: 255 }), // picture under UPLOAD_DIR/images
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ROLES).notNull().default("student"),
  /** per-user switches over the role's defaults: {"chat": false, "images": true} */
  features: jsonText<Record<string, boolean> | null>("features"),
  credits: double("credits").notNull().default(0),
  disabled: boolean("disabled").notNull().default(false),
  /** raised on password change / lock: older sessions stop working */
  sessionVersion: int("session_version").notNull().default(0),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
});

/** Every change of a balance: + top-up / gift / admin, − AI use. */
export const creditLogs = mysqlTable(
  "credit_logs",
  {
    id: pk(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    amount: double("amount").notNull(),
    balance: double("balance").notNull(), // after this change
    kind: mysqlEnum("kind", ["signup", "topup", "admin", "ai", "gift"]).notNull(),
    note: varchar("note", { length: 255 }),
    aiCallId: int("ai_call_id"),
    createdAt: createdAt(),
  },
  (t) => [index("credit_logs_user").on(t.userId, t.createdAt)],
);

/** A learner asks for a top-up package; an admin approves it once paid (no payment gateway yet). */
export const topups = mysqlTable(
  "topups",
  {
    id: pk(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    credits: double("credits").notNull(),
    price: int("price").notNull(), // VND
    status: mysqlEnum("status", ["pending", "done", "rejected"]).notNull().default("pending"),
    note: varchar("note", { length: 255 }),
    couponId: int("coupon_id"), // discount code used; price is already reduced
    discount: int("discount").notNull().default(0), // VND off
    createdAt: createdAt(),
    doneAt: ts("done_at"),
  },
  (t) => [index("topups_status").on(t.status, t.createdAt), index("topups_user").on(t.userId)],
);

/**
 * Codes: "gift" adds credits at once; "discount" lowers the price of a top-up package (percent or VND).
 * Each user uses a code once; `maxUses` caps the uses of everyone together.
 */
export const coupons = mysqlTable("coupons", {
  id: pk(),
  code: varchar("code", { length: 40 }).notNull().unique(), // upper-case
  kind: mysqlEnum("kind", ["gift", "discount"]).notNull(),
  credits: double("credits").notNull().default(0), // gift
  percent: int("percent").notNull().default(0), // discount
  amount: int("amount").notNull().default(0), // discount, VND
  maxUses: int("max_uses"), // null = no cap
  used: int("used").notNull().default(0),
  expiresAt: ts("expires_at"),
  active: boolean("active").notNull().default(true),
  note: varchar("note", { length: 255 }),
  createdAt: createdAt(),
});

export const couponUses = mysqlTable(
  "coupon_uses",
  {
    couponId: int("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.couponId, t.userId] })],
);

/** Bank transfers SePay reported (webhook); `id` is SePay's, so a resent webhook is recognised. */
export const payments = mysqlTable(
  "payments",
  {
    id: bigint("id", { mode: "number" }).primaryKey(), // SePay transaction id
    topupId: int("topup_id"),
    amount: int("amount").notNull(), // VND
    content: varchar("content", { length: 500 }).notNull(),
    status: mysqlEnum("status", ["paid", "underpaid", "unmatched", "settled"]).notNull(), // settled: the request was already closed
    raw: jsonText<Record<string, unknown>>("raw").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("payments_topup").on(t.topupId), index("payments_status").on(t.status, t.createdAt)],
);

/** "Forgot password" links: only a hash of the token is kept; one use, 30 minutes. */
export const passwordResets = mysqlTable(
  "password_resets",
  {
    id: pk(),
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user").on(t.userId, t.createdAt)],
);

/** Every login try, for the admin's security page. */
export const loginLogs = mysqlTable(
  "login_logs",
  {
    id: pk(),
    userId: int("user_id"),
    login: varchar("login", { length: 191 }).notNull(),
    ip: varchar("ip", { length: 64 }).notNull(),
    ok: boolean("ok").notNull(),
    reason: varchar("reason", { length: 40 }),
    createdAt: createdAt(),
  },
  (t) => [index("login_logs_created").on(t.createdAt), index("login_logs_user").on(t.userId)],
);

/** Learner groups: which shared texts they see, and feature switches for all their members. */
export const groups = mysqlTable("learner_groups", {
  id: pk(),
  name: varchar("name", { length: 100 }).notNull(),
  features: jsonText<Record<string, boolean> | null>("features"),
  createdAt: createdAt(),
});

export const userGroups = mysqlTable(
  "user_groups",
  {
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    groupId: int("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] }), index("user_groups_group").on(t.groupId)],
);

/* =====================================================================
 * Settings (key/value)
 * ===================================================================== */
export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 191 }).primaryKey(),
  value: jsonText<unknown>("value").notNull(),
  updatedAt: updatedAt(),
});

/* =====================================================================
 * Labels: user-defined categories for texts and words
 *   kind "topic"  – e.g. Education › Teaching (can be nested)
 *   kind "source" – e.g. The New Yorker, BBC, Cambridge IELTS 18
 *   kind "custom" – anything else: "exam-must-know", "phrasal verbs", "Speaking P2"…
 * ===================================================================== */
export const LABEL_COLORS = ["gray", "red", "orange", "amber", "green", "teal", "blue", "indigo", "purple", "pink"] as const;

export const labels = mysqlTable(
  "labels",
  {
    id: pk(),
    userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
    kind: mysqlEnum("kind", ["topic", "source", "custom"]).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    emoji: varchar("emoji", { length: 16 }),
    color: mysqlEnum("color", LABEL_COLORS).notNull().default("gray"),
    parentId: int("parent_id"), // topics only; self-reference (enforced in code)
    description: varchar("description", { length: 500 }),
    position: int("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("labels_user_kind_name").on(t.userId, t.kind, t.name), index("labels_parent").on(t.parentId)],
);

/* =====================================================================
 * Content: documents → lessons → lesson vocabulary
 * ===================================================================== */
export const documents = mysqlTable("documents", {
  id: pk(),
    userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
  /** who else sees it: nobody, every learner, or the learners of the chosen groups (document_groups) */
  visibility: mysqlEnum("visibility", ["private", "public", "groups"]).notNull().default("private"),
  title: varchar("title", { length: 500 }).notNull(),
  author: varchar("author", { length: 255 }),
  source: varchar("source", { length: 1000 }), // publication name or URL
  sourceType: mysqlEnum("source_type", ["paste", "pdf", "docx", "txt", "url"]).notNull(),
  filePath: varchar("file_path", { length: 500 }), // original file under UPLOAD_DIR
  rawText: longtext("raw_text").notNull(),
  wordCount: int("word_count").notNull().default(0),
  level: varchar("level", { length: 8 }), // estimated CEFR: B1..C2
  /** AI-generated overview: { summary, suggestedTopics[], suggestedSource } – suggestions are only applied when the user accepts them. */
  meta: jsonText<DocumentMeta>("meta"),
  status: mysqlEnum("status", ["draft", "processing", "ready", "error"]).notNull().default("draft"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const lessons = mysqlTable(
  "lessons",
  {
    id: pk(),
    documentId: int("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    position: int("position").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    titleVi: varchar("title_vi", { length: 500 }),
    paragraphs: jsonText<string[]>("paragraphs").notNull(),
    wordCount: int("word_count").notNull().default(0),
    warmup: text("warmup"),
    summary: text("summary"),
    /** Exercises, sentence structures, paraphrase, speaking/writing prompts (validated with zod). */
    content: jsonText<Record<string, unknown>>("content"),
    status: mysqlEnum("status", ["pending", "generating", "ready", "error"]).notNull().default("pending"),
    error: text("error"),
    // legacy (one-user days): copied to lesson_progress for the first admin, no longer written
    completedAt: ts("completed_at"),
    bestScore: int("best_score"), // 0..100
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lessons_doc_pos").on(t.documentId, t.position)],
);

export const lessonVocab = mysqlTable(
  "lesson_vocab",
  {
    id: pk(),
    lessonId: int("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    headword: varchar("headword", { length: 191 }).notNull(),
    match: varchar("match", { length: 191 }).notNull(), // form as it appears in the text
    ipa: varchar("ipa", { length: 191 }),
    pos: varchar("pos", { length: 32 }),
    meaningVi: text("meaning_vi"),
    definitionEn: text("definition_en"),
    example: text("example"),
    note: text("note"),
    context: text("context"), // original sentence from the text
    cefr: varchar("cefr", { length: 4 }),
  },
  (t) => [index("lesson_vocab_lesson").on(t.lessonId)],
);

/** A learner's own state of a lesson (the lesson itself may be a shared one). */
export const lessonProgress = mysqlTable(
  "lesson_progress",
  {
    userId: int("user_id").notNull().references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }),
    lessonId: int("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    completedAt: ts("completed_at"),
    bestScore: int("best_score"),
    notes: text("notes"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

export const documentGroups = mysqlTable(
  "document_groups",
  {
    documentId: int("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    groupId: int("group_id").notNull().references((): AnyMySqlColumn => groups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.groupId] }), index("document_groups_group").on(t.groupId)],
);

/* =====================================================================
 * Vocabulary notebook + FSRS spaced repetition + images
 * ===================================================================== */
export const words = mysqlTable(
  "words",
  {
    id: pk(),
    userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
    term: varchar("term", { length: 191 }).notNull(),
    ipa: varchar("ipa", { length: 191 }),
    pos: varchar("pos", { length: 32 }),
    meaningVi: text("meaning_vi"),
    definitionEn: text("definition_en"),
    context: text("context"),
    example: text("example"),
    note: text("note"),
    mnemonic: text("mnemonic"), // personal memory hook
    lessonId: int("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    lessonVocabId: int("lesson_vocab_id").references(() => lessonVocab.id, { onDelete: "set null" }),
    /** saved while practising listening: the video / IELTS part it was heard in */
    listenSourceId: int("listen_source_id").references((): AnyMySqlColumn => listenSources.id, { onDelete: "set null" }),
    // FSRS card state
    due: ts("due").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    stability: double("stability").notNull().default(0),
    difficulty: double("difficulty").notNull().default(0),
    elapsedDays: int("elapsed_days").notNull().default(0),
    scheduledDays: int("scheduled_days").notNull().default(0),
    reps: int("reps").notNull().default(0),
    lapses: int("lapses").notNull().default(0),
    state: tinyint("state").notNull().default(0), // 0 New, 1 Learning, 2 Review, 3 Relearning
    lastReview: ts("last_review"),
    suspended: boolean("suspended").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("words_due").on(t.userId, t.due), index("words_term").on(t.term)],
);

/** Uploaded / pasted files (images for words, original documents, audio recordings). */
export const media = mysqlTable("media", {
  id: pk(),
  kind: mysqlEnum("kind", ["image", "audio", "document"]).notNull(),
  path: varchar("path", { length: 500 }).notNull(), // relative to UPLOAD_DIR
  mime: varchar("mime", { length: 100 }).notNull(),
  bytes: int("bytes").notNull(),
  width: int("width"),
  height: int("height"),
  source: mysqlEnum("source", ["paste", "upload", "url", "ai"]).notNull().default("upload"),
  sourceUrl: varchar("source_url", { length: 1000 }),
  createdAt: createdAt(),
});

export const wordMedia = mysqlTable(
  "word_media",
  {
    wordId: int("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
    mediaId: int("media_id").notNull().references(() => media.id, { onDelete: "cascade" }),
    position: int("position").notNull().default(0),
    caption: varchar("caption", { length: 500 }),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.mediaId] })],
);

export const reviewLogs = mysqlTable(
  "review_logs",
  {
    id: pk(),
    userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
    wordId: int("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
    rating: tinyint("rating").notNull(), // 1 Again, 2 Hard, 3 Good, 4 Easy
    mode: mysqlEnum("mode", ["recognize", "recall", "cloze", "listen", "spell", "image", "sentence", "passage"]).notNull(), // sentence: wrote a sentence with it; passage: met it in a review passage
    stateBefore: tinyint("state_before").notNull(),
    durationMs: int("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("review_logs_created").on(t.createdAt)],
);

/* =====================================================================
 * Learning history – the raw data for progress tracking
 * ===================================================================== */
export const attempts = mysqlTable(
  "attempts",
  {
    id: pk(),
    userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
    lessonId: int("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    score: int("score").notNull(),
    total: int("total").notNull(),
    durationSec: int("duration_sec"),
    createdAt: createdAt(),
  },
  (t) => [index("attempts_created").on(t.createdAt)],
);

/** One row per answered question → accuracy per question type over time. */
export const answerLogs = mysqlTable(
  "answer_logs",
  {
    id: pk(),
    attemptId: int("attempt_id").notNull().references(() => attempts.id, { onDelete: "cascade" }),
    qtype: mysqlEnum("qtype", ["tfng", "ynng", "mcq", "gap", "matching", "heading", "short"]).notNull(),
    correct: boolean("correct").notNull(),
    given: varchar("given", { length: 500 }),
    expected: varchar("expected", { length: 500 }),
  },
  (t) => [index("answer_logs_type").on(t.qtype)],
);

export const readingSessions = mysqlTable(
  "reading_sessions",
  {
    id: pk(),
    userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
    lessonId: int("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    seconds: int("seconds").notNull(),
    words: int("words").notNull(),
    wpm: int("wpm").notNull(),
    lookups: int("lookups").notNull().default(0), // words looked up while reading
    createdAt: createdAt(),
  },
  (t) => [index("reading_sessions_created").on(t.createdAt)],
);

/** Writing & speaking with AI band scores per IELTS criterion. */
export const writings = mysqlTable("writings", {
  id: pk(),
  userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
  lessonId: int("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
  kind: mysqlEnum("kind", ["paraphrase", "speaking", "task1", "task2", "free", "translate", "sentence"]).notNull(),
  prompt: text("prompt"),
  body: longtext("body").notNull(),
  audioMediaId: int("audio_media_id").references(() => media.id, { onDelete: "set null" }),
  wordCount: int("word_count").notNull().default(0),
  bandOverall: double("band_overall"),
  band1: double("band_1"), // TR/TA  or Fluency & Coherence
  band2: double("band_2"), // CC     or Lexical Resource
  band3: double("band_3"), // LR     or Grammar
  band4: double("band_4"), // GRA    or Pronunciation
  feedback: jsonText<Record<string, unknown>>("feedback"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Periodic benchmark tests – the objective "before vs. after" measurement. */
export const assessments = mysqlTable(
  "assessments",
  {
    id: pk(),
    userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
    kind: mysqlEnum("kind", ["reading_test", "vocab_size", "writing_task2", "speaking", "word_practice"]).notNull(),
    score: double("score").notNull(),
    maxScore: double("max_score"),
    band: double("band"),
    detail: jsonText<Record<string, unknown>>("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("assessments_kind").on(t.kind, t.createdAt)],
);

/* =====================================================================
 * Motivation: daily activity, XP, goals, achievements
 * ===================================================================== */
/** One row per local day – streaks, heat map, daily goal. */
export const activity = mysqlTable("activity", {
  userId: int("user_id").notNull().default(0),
  day: date("day", { mode: "string" }).notNull(), // YYYY-MM-DD in the user's time zone
  minutes: int("minutes").notNull().default(0),
  xp: int("xp").notNull().default(0),
  reviews: int("reviews").notNull().default(0),
  lessonsDone: int("lessons_done").notNull().default(0),
  wordsAdded: int("words_added").notNull().default(0),
  goalMet: boolean("goal_met").notNull().default(false),
  freezeUsed: boolean("freeze_used").notNull().default(false), // streak freeze
  mood: tinyint("mood"), // optional 1..5 self-rating
  reflection: text("reflection"), // "What did I learn today?"
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

export const xpEvents = mysqlTable(
  "xp_events",
  {
    id: pk(),
    userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
    kind: varchar("kind", { length: 50 }).notNull(), // lesson_done, review, perfect_score, streak_bonus...
    amount: int("amount").notNull(),
    refType: varchar("ref_type", { length: 50 }),
    refId: int("ref_id"),
    createdAt: createdAt(),
  },
  (t) => [index("xp_events_created").on(t.createdAt)],
);

export const goals = mysqlTable("goals", {
  id: pk(),
  userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
  kind: mysqlEnum("kind", [
    "daily_minutes",
    "daily_reviews",
    "weekly_lessons",
    "weekly_words",
    "target_band",
    "exam_date",
  ]).notNull(),
  target: double("target").notNull(),
  dueDate: date("due_date", { mode: "string" }),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const achievements = mysqlTable("achievements", {
  userId: int("user_id").notNull().default(0),
  code: varchar("code", { length: 64 }).notNull(), // e.g. streak_7, words_100, first_band_7
  progress: int("progress").notNull().default(0),
  unlockedAt: ts("unlocked_at"),
}, (t) => [primaryKey({ columns: [t.userId, t.code] })]);

/* =====================================================================
 * AI providers & usage
 * ===================================================================== */
export const aiProviders = mysqlTable("ai_providers", {
  id: pk(),
  name: varchar("name", { length: 32 }).notNull(), // deepseek | openai | gemini | xai | custom
  label: varchar("label", { length: 100 }).notNull(),
  baseUrl: varchar("base_url", { length: 500 }).notNull(),
  apiKeyEnc: text("api_key_enc").notNull(), // AES-256-GCM
  defaultModel: varchar("default_model", { length: 100 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
});

export const aiCalls = mysqlTable(
  "ai_calls",
  {
    id: pk(),
    providerId: int("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
    userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
    credits: double("credits"), // charged to the user
    model: varchar("model", { length: 100 }).notNull(),
    task: varchar("task", { length: 50 }).notNull(), // lesson | explain | grade_writing | chat ...
    promptTokens: int("prompt_tokens"),
    completionTokens: int("completion_tokens"),
    costUsd: double("cost_usd"),
    ok: boolean("ok").notNull(),
    error: text("error"),
    durationMs: int("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_calls_created").on(t.createdAt), index("ai_calls_user").on(t.userId, t.createdAt)],
);

/* =====================================================================
 * Background job queue (processed by the worker)
 * ===================================================================== */
export const jobs = mysqlTable(
  "jobs",
  {
    id: pk(),
    type: varchar("type", { length: 50 }).notNull(),
    payload: jsonText<Record<string, unknown>>("payload").notNull(),
    userId: int("user_id"), // who queued it: its AI calls are charged to them
    status: mysqlEnum("status", ["queued", "running", "done", "failed"]).notNull().default("queued"),
    attempts: int("attempts").notNull().default(0),
    maxAttempts: int("max_attempts").notNull().default(3),
    progress: varchar("progress", { length: 255 }), // e.g. "Generating lesson 3/12"
    result: jsonText<unknown>("result"),
    error: text("error"),
    runAt: ts("run_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_pick").on(t.status, t.runAt)],
);

/* =====================================================================
 * Offline dictionary (imported from StarDict, e.g. redphx/tudien)
 * ===================================================================== */
export const dictEntries = mysqlTable(
  "dict_entries",
  {
    id: pk(),
    dict: varchar("dict", { length: 32 }).notNull(), // dictionary id, e.g. "tudien"
    headword: varchar("headword", { length: 191 }).notNull(),
    lookupKey: varchar("lookup_key", { length: 191 }).notNull(), // normalized lower-case headword
    html: longtext("html").notNull(), // sanitized at import time
  },
  (t) => [index("dict_entries_key").on(t.lookupKey), index("dict_entries_dict").on(t.dict)],
);

/** Alternative spellings / inflections that point to an entry (StarDict .syn file). */
export const dictAliases = mysqlTable(
  "dict_aliases",
  {
    id: pk(),
    dict: varchar("dict", { length: 32 }).notNull(),
    lookupKey: varchar("lookup_key", { length: 191 }).notNull(),
    entryId: int("entry_id").notNull().references(() => dictEntries.id, { onDelete: "cascade" }),
  },
  (t) => [index("dict_aliases_key").on(t.lookupKey), index("dict_aliases_dict").on(t.dict)],
);

/* =====================================================================
 * Reader: highlights & margin notes, quick AI questions
 * ===================================================================== */
/**
 * A highlight/comment anchored to a text range inside one lesson paragraph.
 * Anchoring follows the W3C TextQuoteSelector idea: offsets for speed, plus the quoted text
 * with a little context so the note can be re-attached if the paragraph text ever changes.
 */
export const annotations = mysqlTable(
  "annotations",
  {
    id: pk(),
    userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
    lessonId: int("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    paragraph: int("paragraph").notNull(), // index in lessons.paragraphs
    startOffset: int("start_offset").notNull(), // character offsets in the paragraph's plain text
    endOffset: int("end_offset").notNull(),
    quote: varchar("quote", { length: 1000 }).notNull(),
    prefix: varchar("prefix", { length: 64 }),
    suffix: varchar("suffix", { length: 64 }),
    color: mysqlEnum("color", ["yellow", "green", "blue", "pink", "purple"]).notNull().default("yellow"),
    note: text("note"), // empty = highlight only
    // summary: the learner's own one-line summary of a paragraph or part of it, shown faintly so words stay clickable
    kind: mysqlEnum("kind", ["highlight", "summary"]).notNull().default("highlight"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("annotations_lesson").on(t.lessonId, t.paragraph)],
);

/** Questions asked to the AI from the reader (or the dictionary), kept as a searchable history. */
export const aiMessages = mysqlTable(
  "ai_messages",
  {
    id: pk(),
    userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
    lessonId: int("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    annotationId: int("annotation_id").references(() => annotations.id, { onDelete: "set null" }),
    action: mysqlEnum("action", ["explain_word", "explain_sentence", "grammar", "translate", "paraphrase", "custom", "feedback"]).notNull(),
    selection: text("selection"), // highlighted text
    context: text("context"), // surrounding sentence/paragraph sent to the AI
    question: text("question"), // free-form question (action = custom)
    answer: longtext("answer"),
    providerId: int("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
    model: varchar("model", { length: 100 }),
    pinned: boolean("pinned").notNull().default(false), // shown in the margin like a note
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_lesson").on(t.lessonId)],
);

/* =====================================================================
 * Label assignments (many-to-many)
 * ===================================================================== */
export const documentLabels = mysqlTable(
  "document_labels",
  {
    documentId: int("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    labelId: int("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.labelId] }), index("document_labels_label").on(t.labelId)],
);

export const wordLabels = mysqlTable(
  "word_labels",
  {
    wordId: int("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
    labelId: int("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.labelId] }), index("word_labels_label").on(t.labelId)],
);

/* =====================================================================
 * Study sets (Quizlet-style "học phần"): named, ordered groups of saved words.
 * A word can be in many sets; removing it from a set keeps the word.
 * ===================================================================== */
export const wordSets = mysqlTable("word_sets", {
  id: pk(),
  userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
  title: varchar("title", { length: 191 }).notNull(),
  description: varchar("description", { length: 1000 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const wordSetItems = mysqlTable(
  "word_set_items",
  {
    setId: int("set_id").notNull().references(() => wordSets.id, { onDelete: "cascade" }),
    wordId: int("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
    position: int("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.setId, t.wordId] }), index("word_set_items_word").on(t.wordId)],
);

/* =====================================================================
 * IELTS test books (uploaded Cambridge-style PDFs + audio)
 *   book → pages (image + text, OCR'd by AI when the PDF is a scan) → tests → sections (one Listening part,
 *   Reading passage or Writing task each). Question content and answer keys are JSON, edited on the review screen.
 * ===================================================================== */
export const ieltsBooks = mysqlTable("ielts_books", {
  id: pk(),
  title: varchar("title", { length: 191 }).notNull(),
  status: mysqlEnum("status", ["uploading", "parsing", "review", "failed"]).notNull().default("uploading"),
  pageCount: int("page_count").notNull().default(0),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ieltsPages = mysqlTable(
  "ielts_pages",
  {
    id: pk(),
    bookId: int("book_id").notNull().references(() => ieltsBooks.id, { onDelete: "cascade" }),
    page: int("page").notNull(),
    text: longtext("text"),
    imagePath: varchar("image_path", { length: 255 }),
    ocr: boolean("ocr").notNull().default(false),
  },
  (t) => [uniqueIndex("ielts_pages_book_page").on(t.bookId, t.page)],
);

export const ieltsAudio = mysqlTable("ielts_audio", {
  id: pk(),
  bookId: int("book_id").notNull().references(() => ieltsBooks.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  path: varchar("path", { length: 255 }).notNull(),
  size: int("size").notNull(),
  received: int("received").notNull().default(0),
  /** whole-test recording: second where each part is announced, found by Whisper in the browser ({"1":22,"2":431,…}) */
  marks: jsonText<Record<string, number> | null>("marks"),
  createdAt: createdAt(),
});

export const ieltsTests = mysqlTable(
  "ielts_tests",
  {
    id: pk(),
    bookId: int("book_id").notNull().references(() => ieltsBooks.id, { onDelete: "cascade" }),
    number: int("number").notNull(),
    title: varchar("title", { length: 191 }).notNull(),
  },
  (t) => [index("ielts_tests_book").on(t.bookId, t.number)],
);

export const ieltsSections = mysqlTable(
  "ielts_sections",
  {
    id: pk(),
    testId: int("test_id").notNull().references(() => ieltsTests.id, { onDelete: "cascade" }),
    skill: mysqlEnum("skill", ["listening", "reading", "writing"]).notNull(),
    part: int("part").notNull(),
    title: varchar("title", { length: 255 }),
    content: jsonText<Record<string, unknown>>("content").notNull(),
    answers: jsonText<Record<string, string>>("answers").notNull(),
    transcript: longtext("transcript"),
    audio: jsonText<{ fileId: number; start?: number | null; end?: number | null } | null>("audio"),
    pages: jsonText<number[]>("pages").notNull(),
    reviewed: boolean("reviewed").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [index("ielts_sections_test").on(t.testId, t.skill, t.part)],
);

/** One try: a mock test (whole test or one skill, timed like the computer exam) or practice of one section / question group. */
export const ieltsAttempts = mysqlTable(
  "ielts_attempts",
  {
    id: pk(),
    userId: int("user_id").references((): AnyMySqlColumn => users.id, { onDelete: "cascade" }), // owner
    testId: int("test_id").notNull().references(() => ieltsTests.id, { onDelete: "cascade" }),
    sectionId: int("section_id").references(() => ieltsSections.id, { onDelete: "cascade" }),
    mode: mysqlEnum("mode", ["mock", "practice"]).notNull(),
    skill: mysqlEnum("skill", ["listening", "reading", "writing", "full"]).notNull(),
    answers: jsonText<Record<string, unknown>>("answers").notNull(),
    detail: jsonText<Record<string, unknown>>("detail").notNull(),
    score: int("score"),
    total: int("total"),
    band: double("band"),
    seconds: int("seconds").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ielts_attempts_created").on(t.createdAt), index("ielts_attempts_section").on(t.sectionId)],
);

/* =====================================================================
 *  Listening bank: dictation sentences from YouTube videos and IELTS Listening parts
 * ===================================================================== */
/** One recording cut into sentences: a YouTube video (played in YouTube's own player) or an IELTS Listening part. */
export const listenSources = mysqlTable("listen_sources", {
  id: pk(),
  kind: mysqlEnum("kind", ["youtube", "ielts"]).notNull(),
  youtubeId: varchar("youtube_id", { length: 20 }),
  sectionId: int("section_id").references(() => ieltsSections.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  /** where the words came from: the uploader's captions, YouTube's automatic ones, pasted by the learner, an audioscript */
  captions: mysqlEnum("captions", ["manual", "auto", "pasted", "script"]).notNull(),
  /** seconds added to every cut (captions running early or late) */
  shift: double("shift").notNull().default(0),
  reviewed: boolean("reviewed").notNull().default(false),
  /** next sentence of "dictate the whole video" */
  position: int("position").notNull().default(0),
  createdAt: createdAt(),
});

export const listenItems = mysqlTable(
  "listen_items",
  {
    id: pk(),
    sourceId: int("source_id").notNull().references(() => listenSources.id, { onDelete: "cascade" }),
    idx: int("idx").notNull(),
    start: double("start").notNull(),
    end: double("end").notNull(),
    text: text("text").notNull(),
    speaker: varchar("speaker", { length: 64 }),
    /** share of the script's words Whisper heard at this place (IELTS); low → check the cut */
    confidence: double("confidence"),
    /** words per second */
    rate: double("rate").notNull().default(0),
    /** reported as wrong while practising: out of the bank until reviewed */
    hidden: boolean("hidden").notNull().default(false),
    // legacy (one-user days), copied to listen_progress for the first admin, no longer written: round … misses
    /** random practice: how many rounds have shown it (the next round takes the least-shown ones) */
    round: int("round").notNull().default(0),
    seenAt: ts("seen_at"),
    tries: int("tries").notNull().default(0),
    /** first check right with no hint */
    clean: int("clean").notNull().default(0),
    /** review schedule: only sentences once got wrong; null = not in review */
    due: ts("due"),
    interval: int("interval").notNull().default(0),
    lapses: int("lapses").notNull().default(0),
    /** missed words by kind, all tries: {"function":3,"ending":1} */
    misses: jsonText<Record<string, number> | null>("misses"),
  },
  (t) => [index("listen_items_source").on(t.sourceId, t.idx), index("listen_items_due").on(t.due)],
);

/**
 * What Whisper heard in an IELTS part's stretch of audio (times in the file): compared with the sentences in the review
 * editor, given to the AI clean-up, and reused when the part is cut again from the same stretch.
 */
export const listenSpeech = mysqlTable("listen_speech", {
  sectionId: int("section_id")
    .primaryKey()
    .references(() => ieltsSections.id, { onDelete: "cascade" }),
  fileId: int("file_id").notNull(),
  start: double("start").notNull(),
  end: double("end"),
  heard: jsonText<{ w: string; s: number; e: number }[]>("heard").notNull(),
  quiet: jsonText<[number, number][]>("quiet").notNull(),
  createdAt: createdAt(),
});

/** A learner's practice of one bank sentence (the sentences are shared). */
export const listenProgress = mysqlTable(
  "listen_progress",
  {
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    itemId: int("item_id").notNull().references(() => listenItems.id, { onDelete: "cascade" }),
    round: int("round").notNull().default(0),
    seenAt: ts("seen_at"),
    tries: int("tries").notNull().default(0),
    clean: int("clean").notNull().default(0),
    due: ts("due"),
    interval: int("interval").notNull().default(0),
    lapses: int("lapses").notNull().default(0),
    misses: jsonText<Record<string, number> | null>("misses"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] }), index("listen_progress_due").on(t.userId, t.due)],
);

/** A learner's next sentence of "dictate the whole video". */
export const listenPositions = mysqlTable(
  "listen_positions",
  {
    userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sourceId: int("source_id").notNull().references(() => listenSources.id, { onDelete: "cascade" }),
    position: int("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.sourceId] })],
);
