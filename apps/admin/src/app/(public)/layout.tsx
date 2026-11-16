import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LanguageSwitch } from "@/components/language-switch";
import { Card } from "@/components/ui/card";

// Trang công khai mở từ link trong thư (xác minh email, đặt lại mật khẩu): không cần đăng nhập,
// proxy không chặn (`matcher` của `src/proxy.ts`). Cùng khung với trang đăng nhập.
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const app = await getTranslations("app");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <p className="text-sm font-semibold tracking-wide text-muted-foreground">
        {app("name")} · {app("admin")}
      </p>
      <Card className="w-full max-w-sm">{children}</Card>
      <LanguageSwitch />
    </main>
  );
}
