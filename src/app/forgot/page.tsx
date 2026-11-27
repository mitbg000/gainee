import AuthShell from "@/components/auth/AuthShell";
import { getSecurity, mailOn } from "@/lib/security";
import ForgotForm from "./ForgotForm";

export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  return (
    <AuthShell>
      <ForgotForm mail={mailOn(await getSecurity())} />
    </AuthShell>
  );
}
