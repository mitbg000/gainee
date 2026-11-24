/**
 * Sound while studying: short effects (synthesised with Web Audio – no files to load) and reading words aloud
 * automatically. Settings are per device (localStorage) and shared by every page through a window event.
 */
export type SoundPrefs = { muted: boolean; effects: boolean; autoSpeak: boolean };
const KEY = "rl_sound";
const EVENT = "rl-sound";
export const DEFAULT_SOUND: SoundPrefs = { muted: false, effects: true, autoSpeak: true };

export function soundPrefs(): SoundPrefs {
  try {
    return { ...DEFAULT_SOUND, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULT_SOUND;
  }
}
export function setSoundPrefs(p: Partial<SoundPrefs>) {
  const next = { ...soundPrefs(), ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  if (next.muted && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  return next;
}
export function onSoundPrefs(fn: (p: SoundPrefs) => void) {
  const h = (e: Event) => fn((e as CustomEvent<SoundPrefs>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

let ctx: AudioContext | null = null;
/** One tone with a quick attack and fade, so effects are soft rather than beeps. */
function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.12) {
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx!.currentTime + start);
  g.gain.setValueAtTime(0, ctx!.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, ctx!.currentTime + start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx!.currentTime + start + dur);
  o.connect(g).connect(ctx!.destination);
  o.start(ctx!.currentTime + start);
  o.stop(ctx!.currentTime + start + dur + 0.02);
}

const EFFECTS = {
  correct: () => (tone(660, 0, 0.12), tone(880, 0.09, 0.22)), // rising two notes
  wrong: () => (tone(220, 0, 0.18, "triangle", 0.14), tone(185, 0.12, 0.25, "triangle", 0.12)), // low, falling
  flip: () => tone(520, 0, 0.07, "triangle", 0.07), // soft click
  tap: () => tone(420, 0, 0.05, "triangle", 0.06),
  match: () => tone(780, 0, 0.12, "sine", 0.1),
  done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.3, "sine", 0.1)), // short fanfare
} as const;
export type Effect = keyof typeof EFFECTS;

/** Play a study sound effect unless sound is muted or effects are off. */
export function sfx(kind: Effect) {
  if (typeof window === "undefined") return;
  const p = soundPrefs();
  if (p.muted || !p.effects) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    EFFECTS[kind]();
  } catch {}
}
