import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { PasswordDialog } from "@/components/account/password-dialog";
import { PageTabs } from "@/components/ui/page-tabs";
import { ToastProvider } from "@/components/ui/toast";
import { getMe } from "@/lib/viewer";

// Màn "Tài khoản của tôi": việc của chính người đang đăng nhập, không cần permission nào.
// Mỗi tab một đường dẫn con. Tab "Thông báo" của bản thiết kế chờ API tuỳ chọn nhận thông báo.
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("account");
  const me = await getMe();
  const tabs = [
    { href: "/account", label: t("tabs.profile") },
    { href: "/account/security", label: t("tabs.security") },
    { href: "/account/sessions", label: t("tabs.sessions") },
    { href: "/account/data", label: t("tabs.data") },
  ];
  return (
    <ToastProvider>
      <div className="page">
        <section className="phead">
          <div className="phead-main">
            <span className="crumb ell">{me.name ? `${me.name} · ${me.email}` : me.email}</span>
            <h1 className="h1">{t("title")}</h1>
            <p className="pdesc">{t("description")}</p>
          </div>
          <div className="headacts">
            <PasswordDialog triggerClass="btn" />
          </div>
        </section>
        <PageTabs tabs={tabs} label={t("tabs.label")} />
        {children}
      </div>
    </ToastProvider>
  );
}
