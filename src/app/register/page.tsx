import { notFound } from "next/navigation";
import { getCreditConfig } from "@/lib/credits";
import { captchaOn, getSecurity } from "@/lib/security";
import { getTheme } from "@/theme/server";
import RegisterForm from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [cfg, sec] = await Promise.all([getCreditConfig(), getSecurity()]);
  if (!cfg.allowSignup) notFound();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <RegisterForm theme={await getTheme()} bonus={cfg.signupBonus} siteKey={captchaOn(sec) ? sec.turnstileSiteKey : null} />
    </main>
  );
}
