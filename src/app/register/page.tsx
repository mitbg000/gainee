import { notFound } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import { getCreditConfig } from "@/lib/credits";
import { captchaOn, getSecurity } from "@/lib/security";
import RegisterForm from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [cfg, sec] = await Promise.all([getCreditConfig(), getSecurity()]);
  if (!cfg.allowSignup) notFound();
  return (
    <AuthShell>
      <RegisterForm bonus={cfg.signupBonus} siteKey={captchaOn(sec) ? sec.turnstileSiteKey : null} />
    </AuthShell>
  );
}
