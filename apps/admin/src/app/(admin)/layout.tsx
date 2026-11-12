import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import { LanguageSwitch } from "@/components/language-switch";
import { Button } from "@/components/ui/button";
import { load } from "@/lib/core";

// Khung chung của các trang cần đăng nhập. Người dùng hiện tại lấy từ core: phiên không
// còn hợp lệ thì `load` đưa về trang đăng nhập.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  const { data: me } = await load((client) => client.GET("/api/v1/auth/me"));
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/modules" className="font-semibold">
            {t("app.name")}{" "}
            <span className="font-normal text-muted-foreground">{t("app.admin")}</span>
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/modules" className="text-foreground hover:underline">
              {t("nav.modules")}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitch />
            <span className="hidden text-sm text-muted-foreground sm:inline" data-testid="me">
              {me.email}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="outline">
                {t("nav.signOut")}
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
