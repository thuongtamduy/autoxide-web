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
  // Màn Module đã dời vào Cài đặt; giữ link cũ (dấu trang, link trong tài liệu) còn mở được.
  async redirects() {
    return [
      { source: "/modules", destination: "/settings/modules", permanent: true },
      { source: "/modules/:name", destination: "/settings/modules/:name", permanent: true },
    ];
  },
};

export default withNextIntl(config);
