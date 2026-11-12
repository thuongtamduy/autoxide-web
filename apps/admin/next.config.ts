import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  // Bản build tự chứa để chạy trong Docker cạnh core (D-097 của core).
  output: "standalone",
  // Monorepo: dò file cần cho bản build từ gốc repo, để có cả gói `@autoxide/sdk`.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  // `@autoxide/sdk` là mã TypeScript, không build trước.
  transpilePackages: ["@autoxide/sdk"],
  poweredByHeader: false,
};

export default withNextIntl(config);
