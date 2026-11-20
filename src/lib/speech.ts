/** Text-to-speech with the best English voice the device offers (the browser default is often robotic or not English). */
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

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
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
