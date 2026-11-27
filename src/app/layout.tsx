import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { themeInitScript } from "@/theme/config";
import { getLook, getTheme } from "@/theme/server";
import { lookAttrs, lookCss } from "@/theme/look";
import { fontVars } from "@/theme/fonts";
import PwaRegister from "@/components/PwaRegister";
import Toaster from "@/components/Toaster";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: `${t("name")} – ${t("tagline")}`,
    description: t("description"),
    applicationName: t("name"),
    // iOS "Add to Home Screen": open full screen, with our own title and status-bar style.
    appleWebApp: { capable: true, title: t("name"), statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false },
    other: { "mobile-web-app-capable": "yes" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // draw under the notch; content uses safe-area insets
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f1" },
    { media: "(prefers-color-scheme: dark)", color: "#13161c" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, theme, look] = await Promise.all([getLocale(), getTheme(), getLook()]);
  return (
    <html lang={locale} className={`${fontVars}${theme === "dark" ? " dark" : ""}`} {...lookAttrs(look)} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: lookCss() }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* keep the browser's install prompt even if it fires before React has loaded (see InstallApp) */}
        <script dangerouslySetInnerHTML={{ __html: "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bip=e})" }} />
      </head>
      <body className="font-sans antialiased">
        <NextIntlClientProvider>
          {children}
          <Toaster />
        </NextIntlClientProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
