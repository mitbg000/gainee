"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global {
  interface Window {
    __bip?: PromptEvent | null; // caught by the inline script in the root layout, before React loads
  }
}

/**
 * "Install app": Chrome / Edge / Android get the browser's install dialog;
 * iPhone, iPad and Safari on Mac get short instructions (they have no install API).
 * Hidden when the app already runs installed.
 */
export default function InstallApp() {
  const t = useTranslations("install");
  const [evt, setEvt] = useState<PromptEvent | null>(null);
  const [platform, setPlatform] = useState<"ios" | "safari" | null>(null);
  const [installed, setInstalled] = useState(true); // assume installed until checked → no flash
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const safari = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(ua);
    setPlatform(ios ? "ios" : safari ? "safari" : null);
    setEvt(window.__bip ?? null);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__bip = e as PromptEvent;
      setEvt(e as PromptEvent);
    };
    const onInstalled = () => {
      window.__bip = null;
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!evt && !platform)) return null;

  async function install() {
    if (!evt) return setHelp(!help);
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    window.__bip = null;
    setEvt(null);
  }

  return (
    <div className="text-sm">
      <button onClick={install} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-accent px-3 font-medium text-accent hover:bg-accent/10">
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
        {t("button")}
      </button>
      {help && platform && <p className="mt-2 rounded-xl bg-paper p-3 text-xs leading-relaxed text-muted">{t(platform)}</p>}
    </div>
  );
}
