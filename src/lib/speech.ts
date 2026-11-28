/**
 * Reading aloud. First choice: an mp3 made on the server (same natural voice on every device, steady on iPhone);
 * when it is not there quickly enough (or fails), the best English voice the browser offers reads it instead.
 */
let cached: SpeechSynthesisVoice | null = null;

function score(v: SpeechSynthesisVoice) {
  let s = 0;
  if (/^en[-_]US/i.test(v.lang)) s += 30;
  else if (/^en[-_]GB/i.test(v.lang)) s += 25;
  else if (/^en/i.test(v.lang)) s += 10;
  else return -1;
  if (/natural|neural|premium|enhanced|online/i.test(v.name)) s += 40; // Edge / Windows neural, Apple enhanced
  if (/google (us|uk) english/i.test(v.name)) s += 25; // Chrome
  if (/samantha|ava|allison|evan|daniel|serena|aria|jenny|guy|libby|ryan/i.test(v.name)) s += 15;
  if (/espeak|compact|novelty|whisper|bad news|bells|cellos|zarvox|trinoids|boing|organ/i.test(v.name)) s -= 50;
  return s;
}

function bestVoice() {
  if (cached) return cached;
  const best = speechSynthesis.getVoices().map((v) => [score(v), v] as const).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0])[0];
  return (cached = best ? best[1] : null);
}

/** Wait this long (ms) for the server's file before reading with the browser's voice (a new word takes ~1 s). */
const SERVER_WAIT = 1500;
let player: HTMLAudioElement | null = null;
let turn = 0;

function voicePref(): "female" | "male" {
  try {
    return JSON.parse(localStorage.getItem("rl_sound") ?? "{}").voice === "male" ? "male" : "female";
  } catch {
    return "female";
  }
}

/** Where the server's reading of `text` is (also used to fetch it ahead). */
export const speechUrl = (text: string, voice = voicePref()) => `/api/tts?v=${voice}&t=${encodeURIComponent(text.replace(/\s+/g, " ").trim().slice(0, 300))}`;

export function speak(text: string) {
  if (typeof window === "undefined" || !text.trim()) return;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const mine = ++turn;
  player ??= new Audio();
  const a = player;
  a.pause();
  let settled = false;
  // only the latest word may fall back: an older one cut short by a new tap stays quiet
  const fallback = () => {
    if (settled || mine !== turn) return;
    settled = true;
    a.pause();
    browserSpeak(text);
  };
  const timer = setTimeout(fallback, SERVER_WAIT);
  a.onplaying = () => {
    if (mine === turn) settled = true;
    clearTimeout(timer);
  };
  a.onerror = () => (clearTimeout(timer), fallback());
  a.src = speechUrl(text);
  a.play().catch(() => (clearTimeout(timer), fallback()));
}

/** The browser's own speech synthesis. */
function browserSpeak(text: string) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = bestVoice();
  u.lang = v?.lang ?? "en-US";
  if (v) u.voice = v;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

// voices load asynchronously in most browsers
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  speechSynthesis.addEventListener("voiceschanged", () => (cached = null));
}

/** Pages with their own "read words automatically" switch (review, practice): their words follow that switch too. */
export type SpeakScope = "review" | "practice";
let scope: SpeakScope | null = null;
/** The page that is open; null when it closes. */
export function setSpeakScope(s: SpeakScope | null) {
  scope = s;
}
export function scopeAutoRead(s: SpeakScope) {
  try {
    return localStorage.getItem(`autoread_${s}`) !== "0";
  } catch {
    return true;
  }
}
export function setScopeAutoRead(s: SpeakScope, on: boolean) {
  try {
    localStorage.setItem(`autoread_${s}`, on ? "1" : "0");
  } catch {}
}

/** Read a word aloud by itself (new card, answer shown) – only when "read words automatically" is on, for the whole app and for this page, and sound is not muted. */
export function autoSpeak(text: string) {
  if (typeof window === "undefined") return;
  try {
    const p = { muted: false, autoSpeak: true, ...JSON.parse(localStorage.getItem("rl_sound") ?? "{}") };
    if (p.muted || !p.autoSpeak) return;
  } catch {}
  if (scope && !scopeAutoRead(scope)) return;
  speak(text);
}
