"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { numbersOf, SKILL_TIME, type SectionContent, type Skill } from "@/lib/ielts/types";
import Questions, { Passage } from "./Questions";
import * as I from "@/components/icons";

export type MockSection = { id: number; skill: Skill; part: number; content: SectionContent; audio: { url: string; start: number | null; end: number | null } | null };
export type MockData = { testId: number; title: string; book: string; sections: MockSection[] };

const CHECK_TIME = 120; // Listening: 2 minutes to check answers after the recording (computer-delivered test)
const SIZES = [1, 1.15, 1.3];
const CONTRAST = {
  standard: { "--card": "#ffffff", "--paper": "#ffffff", "--ink": "#111111", "--muted": "#555555", "--line": "#cfcfcf", "--accent": "#1f5fbf", "--on-accent": "#ffffff", "--highlight": "#ffe58a" },
  dark: { "--card": "#000000", "--paper": "#000000", "--ink": "#ffffff", "--muted": "#cccccc", "--line": "#555555", "--accent": "#7fb2ff", "--on-accent": "#000000", "--highlight": "#665c00" },
  yellow: { "--card": "#000000", "--paper": "#000000", "--ink": "#ffe600", "--muted": "#e6cf00", "--line": "#6b6100", "--accent": "#ffe600", "--on-accent": "#000000", "--highlight": "#4d4d00" },
} as const;

type Stage = "intro" | "run" | "check" | "sending";
const wordsIn = (s: string) => (s.match(/[\p{L}\p{N}’'-]+/gu) || []).length;
const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s) % 60)).padStart(2, "0")}`;

/** Wrap the selection in <mark> (passage highlighting, like the real computer test); click a mark to remove it. */
function highlightSelection(root: HTMLElement | null) {
  const sel = window.getSelection();
  if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;
  const mark = document.createElement("mark");
  mark.className = "rounded-sm bg-highlight text-inherit cursor-pointer";
  try {
    range.surroundContents(mark);
  } catch {
    mark.appendChild(range.extractContents()); // selection crossing tags
    range.insertNode(mark);
  }
  sel.removeAllRanges();
}

/** The passage DOM is edited by highlighting, so it must not re-render while a part is open. */
const FrozenPassage = memo(function FrozenPassage({ text, intro }: { text: string; intro?: string }) {
  return <Passage text={text} intro={intro} />;
});

/** One part on its own (?part=<section id>): the time the real test gives that part. */
const PART_TIME = (s: MockSection) => (s.skill === "reading" ? 20 * 60 : s.skill === "writing" ? (s.part === 1 ? 20 : 40) * 60 : 10 * 60);

export default function MockTest({ data, skill, sectionId, wholeFile = false }: { data: MockData; skill: Skill | "full"; sectionId?: number; wholeFile?: boolean }) {
  const t = useTranslations("ielts.mock");
  const router = useRouter();
  const skills: Skill[] = (skill === "full" ? (["listening", "reading", "writing"] as Skill[]) : [skill]).filter((s) => data.sections.some((x) => x.skill === s));
  const store = `ielts_mock_${data.testId}_${skill}${sectionId ? `_${sectionId}` : ""}`;

  const [si, setSi] = useState(0); // which skill
  const [stage, setStage] = useState<Stage>("intro");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [part, setPart] = useState(0);
  const [current, setCurrent] = useState<number | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [size, setSize] = useState(0);
  const [contrast, setContrast] = useState<keyof typeof CONTRAST>("standard");
  const [menu, setMenu] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [split, setSplit] = useState(50);
  const [started] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const passageRef = useRef<HTMLDivElement>(null);

  const cur = skills[si];
  const parts = useMemo(() => data.sections.filter((s) => s.skill === cur).sort((a, b) => a.part - b.part), [data.sections, cur]);
  const sec = parts[part];

  // restore an unfinished test after a reload
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(store) ?? "null");
      if (s && Date.now() - s.saved < 6 * 3600_000) {
        setAnswers(s.answers ?? {});
        setFlags(s.flags ?? []);
        setSi(s.si ?? 0);
        if (s.deadline && s.deadline > Date.now() && s.skill !== "listening") {
          setDeadline(s.deadline);
          setStage("run");
        }
      }
    } catch {}
  }, [store]);
  useEffect(() => {
    try {
      localStorage.setItem(store, JSON.stringify({ answers, flags, si, deadline, skill: cur, saved: Date.now() }));
    } catch {}
  }, [store, answers, flags, si, deadline, cur]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const left = deadline ? (deadline - now) / 1000 : null;

  const submit = useCallback(async () => {
    setStage("sending");
    const r = await fetch("/api/ielts/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ testId: data.testId, sectionId, mode: "mock", skill, answers, flags, seconds: Math.round((Date.now() - started) / 1000) }),
    }).catch(() => null);
    if (!r?.ok) {
      setError(t("sendFailed"));
      setStage("run");
      return;
    }
    try {
      localStorage.removeItem(store);
    } catch {}
    router.push(`/ielts/attempts/${(await r.json()).id}`);
  }, [answers, flags, data.testId, sectionId, router, skill, started, store, t]);

  const finishSkill = useCallback(() => {
    audio.current?.pause();
    setDeadline(null);
    setPart(0);
    setCurrent(null);
    if (si + 1 < skills.length) {
      setSi(si + 1);
      setStage("intro");
    } else submit();
  }, [si, skills.length, submit]);

  // time up
  useEffect(() => {
    if (left !== null && left <= 0 && (stage === "run" || stage === "check")) finishSkill();
  }, [left, stage, finishSkill]);

  /* ---------- listening playlist: parts that share a file play as one stretch ---------- */
  const playlist = useMemo(() => {
    const out: { url: string; start: number; end: number | null; part: number }[] = [];
    for (const s of parts) {
      if (!s.audio) continue;
      const last = out[out.length - 1];
      if (last && last.url === s.audio.url && (s.audio.start == null || s.audio.start === last.end)) last.end = s.audio.end ?? null;
      else out.push({ url: s.audio.url, start: s.audio.start ?? 0, end: s.audio.end ?? null, part: s.part });
    }
    return out;
  }, [parts]);
  const track = useRef(0);
  const seekTries = useRef(0);
  const playTrack = useCallback(
    (i: number) => {
      const a = audio.current;
      const tr = playlist[i];
      track.current = i;
      seekTries.current = 0;
      if (!a) return;
      if (!tr) {
        setStage("check");
        setDeadline(Date.now() + CHECK_TIME * 1000);
        return;
      }
      if (a.src !== new URL(tr.url, location.href).href) a.src = tr.url;
      // play() right away, inside the click that started the test (Safari/iOS block it later); seek once the length is known
      const seek = () => {
        if (Math.abs(a.currentTime - tr.start) > 1) a.currentTime = tr.start;
      };
      if (a.readyState >= 1) seek();
      else a.addEventListener("loadedmetadata", seek, { once: true });
      a.play().catch(() => setError(t("audioBlocked")));
      const idx = parts.findIndex((p) => p.part === tr.part);
      if (idx >= 0) setPart(idx);
    },
    [playlist, parts, t],
  );
  /** Time left in the recording now playing (later files of the playlist are not loaded yet). */
  function audioLeft() {
    const a = audio.current;
    const tr = playlist[track.current];
    if (!a || !tr || !Number.isFinite(a.duration)) return "";
    return clock((tr.end ?? a.duration) - a.currentTime);
  }
  function onTime() {
    const a = audio.current;
    const tr = playlist[track.current];
    if (!a || !tr) return;
    // the part must start at its mark: seek again if the browser started from the beginning of the file
    if (a.currentTime < tr.start - 2) {
      if (++seekTries.current > 3) setError(t("seekFailed"));
      else a.currentTime = tr.start;
      return;
    }
    if (tr.end && a.currentTime >= tr.end) playTrack(track.current + 1);
  }
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  function begin() {
    setError(null);
    setPart(0);
    setNow(Date.now());
    if (cur === "listening") {
      setStage("run");
      if (playlist.length) playTrack(0);
      else setDeadline(Date.now() + (sectionId ? PART_TIME(parts[0]) : SKILL_TIME.listening) * 1000);
    } else {
      setDeadline(Date.now() + (sectionId ? PART_TIME(parts[0]) : SKILL_TIME[cur]) * 1000);
      setStage("run");
    }
  }

  /* ---------- question navigation ---------- */
  const nums = useMemo(() => parts.map((p) => (p.skill === "writing" ? [p.part] : numbersOf(p.content))), [parts]);
  const keyOf = (pi: number, n: number) => (parts[pi].skill === "writing" ? `w${n}` : `${parts[pi].id}:${n}`);
  const answered = (pi: number, n: number) => !!answers[keyOf(pi, n)]?.trim();
  function go(pi: number, n: number) {
    setPart(pi);
    setCurrent(n);
    setTimeout(() => {
      const el = document.getElementById(`q-${parts[pi].id}-${n}`);
      // scroll only the questions pane (scrollIntoView would also shift the fixed exam frame)
      const pane = el?.closest(".overflow-y-auto");
      if (el && pane) pane.scrollTo({ top: pane.scrollTop + el.getBoundingClientRect().top - pane.getBoundingClientRect().top - pane.clientHeight / 3, behavior: "smooth" });
      (el?.querySelector("input,select,textarea") as HTMLElement | null)?.focus({ preventScroll: true });
    }, 30);
  }
  const flat = nums.flatMap((ns, pi) => ns.map((n) => [pi, n] as const));
  const at = flat.findIndex(([pi, n]) => pi === part && n === current);
  const step = (d: number) => {
    const nx = flat[Math.min(flat.length - 1, Math.max(0, (at < 0 ? flat.findIndex(([pi]) => pi === part) : at) + d))];
    if (nx) go(nx[0], nx[1]);
  };
  const flagKey = current != null && sec ? keyOf(part, current) : null;

  // track the question being typed in
  function onFocusIn(e: React.FocusEvent) {
    const q = (e.target as HTMLElement).closest("[id^='q-']")?.id.split("-");
    if (q && Number(q[1]) === sec?.id) setCurrent(Number(q[2]));
  }

  const style = { ...CONTRAST[contrast], fontSize: `${SIZES[size]}rem` } as React.CSSProperties;
  const total = nums.flat().length;
  const done = flat.filter(([pi, n]) => answered(pi, n)).length;

  /* ---------- screens ---------- */
  if (!skills.length)
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div>
          <p>{t("empty")}</p>
          <Link href="/ielts" className="btn btn-primary mt-4">
            {t("exit")}
          </Link>
        </div>
      </div>
    );

  // one <audio> for every screen, so the recording keeps playing when the intro screen gives way to the test
  const player = <audio ref={audio} onTimeUpdate={onTime} onEnded={() => playTrack(track.current + 1)} preload="auto" />;

  if (stage === "intro" || stage === "sending")
    return (
      <>
      <div style={style} className="flex min-h-dvh items-center justify-center bg-paper p-6 font-[Arial,Helvetica,sans-serif] text-ink">
        <div className="w-full max-w-xl rounded-lg border border-line bg-card p-8 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-wide text-muted">
            {data.book} · {data.title}
          </p>
          <h1 className="mt-2 text-2xl font-bold">IELTS {cur[0].toUpperCase() + cur.slice(1)}</h1>
          <p className="mt-1 text-muted">{sectionId ? t(`partTime.${cur}`, { part: parts[0]?.part ?? 1, min: Math.round(PART_TIME(parts[0]) / 60) }) : t(`time.${cur}`)}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-[0.95em]">
            {t.raw(`rules.${cur}`).map((r: string, i: number) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          {wholeFile && <p className="mt-3 rounded bg-amber-100 p-2 text-sm text-amber-900">{t("noMarks")}</p>}
          {cur === "listening" && !playlist.length && <p className="mt-3 rounded bg-amber-100 p-2 text-sm text-amber-900">{t("noAudio")}</p>}
          {cur === "listening" && playlist.length > 0 && (
            <div className="mt-4 flex items-center gap-3 rounded border border-line p-3 text-sm">
              <I.IconVolume className="h-5 w-5" />
              <span className="flex-1">{t("soundCheck")}</span>
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-6 flex gap-2">
            <button onClick={begin} disabled={stage === "sending"} className="btn btn-lg btn-primary" autoFocus>
              {stage === "sending" ? t("sending") : t("start")}
            </button>
            <Link href="/ielts" className="btn btn-lg btn-secondary">
              {t("exit")}
            </Link>
          </div>
        </div>
      </div>
      {player}
      </>
    );

  const head = sec.skill === "writing" ? `Write at least ${sec.part === 1 ? 150 : 250} words.` : `${cur === "reading" ? "Read the text below and answer" : "Listen and answer"} questions ${nums[part][0]}–${nums[part][nums[part].length - 1]}.`;

  return (
    <>
    <div style={style} className="fixed inset-0 flex flex-col overflow-hidden bg-paper font-[Arial,Helvetica,sans-serif] text-ink" onFocus={onFocusIn}>
      {/* header */}
      <header className="flex h-14 flex-none items-center gap-3 border-b border-line bg-card px-4">
        <b className="text-lg tracking-tight">IELTS</b>
        <span className="hidden truncate text-sm text-muted sm:block">
          {data.book} · {data.title}
        </span>
        <div className="flex-1" />
        <div className={`flex items-center gap-1.5 rounded px-3 py-1 font-bold tabular-nums ${left !== null && left < 300 ? "bg-red-600 text-white" : ""}`}>
          <I.IconClock className="h-4 w-4" />
          {stage === "check" ? `${t("checkTime")} ${clock(left ?? 0)}` : left !== null ? (left > 300 ? `${Math.ceil(left / 60)} ${t("minutesLeft")}` : clock(left)) : `${t("audioPlaying")} ${audioLeft()}`}
        </div>
        <div className="flex-1" />
        {cur === "listening" && (
          <label className="hidden items-center gap-1.5 sm:flex">
            <I.IconVolume className="h-4 w-4" />
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" className="w-24" />
          </label>
        )}
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="btn btn-sm btn-secondary" aria-expanded={menu}>
            <I.IconGear /> {t("options")}
          </button>
          {menu && (
            <div className="absolute right-0 top-11 z-30 w-64 rounded-lg border border-line bg-card p-3 text-sm shadow-lg">
              <p className="font-bold">{t("textSize")}</p>
              <div className="mt-1 flex gap-1">
                {SIZES.map((_, i) => (
                  <button key={i} onClick={() => setSize(i)} className={`btn btn-sm flex-1 ${size === i ? "btn-primary" : "btn-secondary"}`}>
                    {["A", "A+", "A++"][i]}
                  </button>
                ))}
              </div>
              <p className="mt-3 font-bold">{t("contrast")}</p>
              <div className="mt-1 grid gap-1">
                {(Object.keys(CONTRAST) as (keyof typeof CONTRAST)[]).map((c) => (
                  <button key={c} onClick={() => setContrast(c)} className={`btn btn-sm justify-start ${contrast === c ? "btn-primary" : "btn-secondary"}`}>
                    {t(`contrastName.${c}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            if (confirm(t("exitConfirm"))) router.push("/ielts");
          }}
          className="btn btn-sm btn-ghost"
          aria-label={t("exit")}
        >
          <I.IconX />
        </button>
      </header>

      {/* part banner */}
      <div className="flex-none border-b border-line bg-ink/5 px-4 py-2">
        <b>Part {sec.part}</b> <span className="ml-2">{head}</span>
        {error && <span className="ml-3 text-sm text-red-600">{error}</span>}
      </div>

      {/* body */}
      <main className="flex min-h-0 flex-1">
        {sec.skill === "reading" ? (
          <>
            <div
              key={sec.id}
              ref={passageRef}
              style={{ width: `${split}%` }}
              className="min-w-0 overflow-y-auto border-r border-line bg-card p-6"
              onMouseUp={() => highlightSelection(passageRef.current)}
              onClick={(e) => {
                const m = (e.target as HTMLElement).closest("mark");
                if (m && window.getSelection()?.isCollapsed) m.replaceWith(...Array.from(m.childNodes));
              }}
            >
              <FrozenPassage text={sec.content.passage ?? ""} intro={sec.content.intro} />
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              className="w-2 flex-none cursor-col-resize bg-line/60 hover:bg-accent/40"
              onPointerDown={(e) => {
                const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                const move = (ev: PointerEvent) => setSplit(Math.min(80, Math.max(20, ((ev.clientX - box.left) / box.width) * 100)));
                const up = () => (removeEventListener("pointermove", move), removeEventListener("pointerup", up));
                addEventListener("pointermove", move);
                addEventListener("pointerup", up);
              }}
            />
            <div className="min-w-0 flex-1 overflow-y-auto bg-card p-6">
              <Questions content={sec.content} sid={sec.id} values={answers} onChange={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))} />
            </div>
          </>
        ) : sec.skill === "writing" ? (
          <>
            <div className="w-1/2 min-w-0 overflow-y-auto border-r border-line bg-card p-6">
              <p className="whitespace-pre-line">{sec.content.prompt}</p>
              {sec.content.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sec.content.image} alt="" className="mt-4 max-w-full rounded border border-line bg-white" />
              )}
            </div>
            <div id={`q-${sec.id}-${sec.part}`} className="flex min-w-0 flex-1 flex-col bg-card p-6">
              <textarea
                value={answers[`w${sec.part}`] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [`w${sec.part}`]: e.target.value }))}
                spellCheck={false}
                autoCorrect="off"
                className="min-h-0 flex-1 resize-none rounded border-2 border-line bg-card p-3 leading-relaxed text-ink outline-none focus:border-accent"
              />
              <p className="mt-2 text-right text-sm text-muted">Word count: {wordsIn(answers[`w${sec.part}`] ?? "")}</p>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1 overflow-y-auto bg-card">
            <div className="mx-auto max-w-4xl p-6">
              <Questions content={sec.content} sid={sec.id} values={answers} onChange={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))} />
            </div>
          </div>
        )}
      </main>

      {/* question navigator */}
      <nav className="flex flex-none items-center gap-2 overflow-x-auto border-t border-line bg-card px-3 py-2">
        <label className="flex flex-none cursor-pointer items-center gap-1.5 text-sm font-semibold">
          <input
            type="checkbox"
            disabled={!flagKey}
            checked={!!flagKey && flags.includes(flagKey)}
            onChange={() => flagKey && setFlags((f) => (f.includes(flagKey) ? f.filter((x) => x !== flagKey) : [...f, flagKey]))}
            className="size-4"
          />
          Review
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {parts.map((p, pi) => (
            <div key={p.id} className={`flex flex-none items-center gap-1 rounded px-2 py-1 ${pi === part ? "bg-ink/5" : ""}`}>
              <button onClick={() => go(pi, nums[pi][0])} className="whitespace-nowrap text-sm font-bold">
                Part {p.part}
                {pi !== part && (
                  <span className="ml-1 font-normal text-muted">
                    {nums[pi].filter((n) => answered(pi, n)).length}/{nums[pi].length}
                  </span>
                )}
              </button>
              {pi === part &&
                nums[pi].map((n) => {
                  const k = keyOf(pi, n);
                  return (
                    <button
                      key={n}
                      onClick={() => go(pi, n)}
                      aria-label={`Question ${n}`}
                      className={`h-7 min-w-7 rounded px-1 text-xs font-bold ${current === n ? "bg-accent text-on-accent" : answered(pi, n) ? "border-b-4 border-accent bg-ink/10" : "border border-line"} ${flags.includes(k) ? "!rounded-full ring-2 ring-amber-500" : ""}`}
                    >
                      {p.skill === "writing" ? `Task ${n}` : n}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
        <span className="hidden flex-none text-xs text-muted md:block">
          {done}/{total}
        </span>
        <button onClick={() => step(-1)} className="btn btn-sm btn-secondary flex-none" aria-label="Previous">
          <I.IconArrowLeft />
        </button>
        <button onClick={() => step(1)} className="btn btn-sm btn-primary flex-none" aria-label="Next">
          <I.IconArrowRight />
        </button>
        <button
          onClick={() => {
            if (confirm(si + 1 < skills.length ? t("nextSkillConfirm") : t("submitConfirm", { left: total - done }))) finishSkill();
          }}
          className="btn btn-sm btn-primary flex-none"
        >
          <I.IconCheck /> {si + 1 < skills.length ? t("nextSkill") : t("submit")}
        </button>
      </nav>
    </div>
    {player}
    </>
  );
}
