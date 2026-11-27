"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import AccountSettings from "./AccountSettings";
import ProfileSettings from "./ProfileSettings";
import * as I from "@/components/icons";

/** The profile header (a summary, from the server) with an Edit button that opens the account and learning-profile forms below it. */
export default function ProfileEdit({ children, account }: { children: React.ReactNode; account: { avatar: string | null; name: string; email: string } }) {
  const t = useTranslations("profile");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (location.hash === "#me") setOpen(true); // old "/settings?tab=profile" links land here
  }, []);
  return (
    <section id="me" className="scroll-mt-20 rounded-2xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">{children}</div>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className={`btn btn-sm ${open ? "btn-primary" : "btn-secondary"}`}>
          {open ? <I.IconCheck className="h-4 w-4" /> : <I.IconEdit />} {open ? t("done") : t("edit")}
        </button>
      </div>
      {open && (
        <div className="mt-5 grid gap-6 border-t border-line pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <AccountSettings avatar={account.avatar} name={account.name} email={account.email} />
          <ProfileSettings />
        </div>
      )}
    </section>
  );
}
