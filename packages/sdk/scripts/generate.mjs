// Sinh kiểu dữ liệu TypeScript từ tài liệu OpenAPI của core.
//
// Nguồn: biến AUTOXIDE_OPENAPI (đường dẫn file hoặc URL); không đặt thì tải bản của
// tag core đang ghim (CORE_VERSION). Bản đã tải được lưu ở `openapi.json` và commit cùng
// `src/schema.d.ts`, nên build không cần mạng. Nâng core: đổi CORE_VERSION rồi chạy lại.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CORE_VERSION = "v0.5.0";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source =
  process.env.AUTOXIDE_OPENAPI ??
  `https://raw.githubusercontent.com/thuongtamduy/autoxide/${CORE_VERSION}/docs/openapi.json`;

const text = /^https?:\/\//.test(source)
  ? await (await fetch(source)).text()
  : await readFile(source, "utf8");
// Kiểm là JSON hợp lệ trước khi ghi đè bản đang có.
JSON.parse(text);
await writeFile(join(root, "openapi.json"), text);
execFileSync(
  join(root, "node_modules/.bin/openapi-typescript"),
  ["openapi.json", "--output", "src/schema.d.ts"],
  { cwd: root, stdio: "inherit" },
);
