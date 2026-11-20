"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DISMISS_KEY = "rl_install_dismissed";

/**
 * Suggests installing the app:
 *  - Android / desktop Chrome & Edge: native install prompt (beforeinstallprompt)
 *  - iOS / iPadOS Safari: there is no prompt API, so show "Share → Add to Home Screen" instructions
 * Hidden when already running as an installed app or after the user dismisses it.
 */
export default function InstallPrompt() {
  const t = useTranslations("install");
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (standalone || dismissed) return;

    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIos) {
      setIos(true);
      setHidden(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  return (
    <div className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="h-11 w-11 flex-none rounded-xl" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{t("title")}</p>
        {ios ? (
          <p className="mt-0.5 text-muted">
            {t.rich("ios", { b: (c) => <b className="text-ink">{c}</b>, share: () => <ShareIcon /> })}
          </p>
        ) : (
          <p className="mt-0.5 text-muted">{t("android")}</p>
        )}
        <div className="mt-3 flex gap-2">
          {evt && (
            <button
              onClick={async () => {
                await evt.prompt();
                await evt.userChoice;
                setHidden(true);
              }}
              className="btn btn-primary"
            >
              {t("install")}
            </button>
          )}
          <button onClick={dismiss} className="btn btn-ghost">
            {t("dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="mx-0.5 inline h-4 w-4 align-[-2px]" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
