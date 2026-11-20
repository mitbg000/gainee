import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { themeInitScript } from "@/theme/config";
import { getTheme } from "@/theme/server";
import PwaRegister from "@/components/PwaRegister";
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
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);
  return (
    <html lang={locale} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
