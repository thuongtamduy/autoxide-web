// Chạy bản build `output: "standalone"` như khi triển khai: chép tài nguyên tĩnh vào cạnh
// `server.js` (Next.js không tự chép) rồi khởi động. Cổng lấy từ PORT (mặc định 3000).
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(app, ".next/standalone/apps/admin");
if (!existsSync(join(standalone, "server.js"))) {
  process.stderr.write("No standalone build found; run `pnpm build` first.\n");
  process.exit(1);
}
cpSync(join(app, ".next/static"), join(standalone, ".next/static"), { recursive: true });
if (existsSync(join(app, "public"))) {
  cpSync(join(app, "public"), join(standalone, "public"), { recursive: true });
}
const server = spawn(process.execPath, ["server.js"], { cwd: standalone, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
