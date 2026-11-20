import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["mysql2"],
  poweredByHeader: false,
  // Keep visited pages in the browser for a short while so moving between pages does not refetch every time.
  // router.refresh() (used after edits) still clears it.
  experimental: { staleTimes: { dynamic: 60, static: 300 } },
};

export default withNextIntl(nextConfig);
