import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["mysql2", "sharp"],
  poweredByHeader: false,
  // Keep visited pages in the browser for a short while so moving between pages does not refetch every time.
  // router.refresh() (used after edits) still clears it.
  experimental: { staleTimes: { dynamic: 60, static: 300 } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // no framing (clickjacking), no plugins, no <base> or form posts to other sites; scripts are not restricted (inline theme script)
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // microphone: speaking practice
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
          // browsers ignore it over plain http, so local development is unaffected
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
