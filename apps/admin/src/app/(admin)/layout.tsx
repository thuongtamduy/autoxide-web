import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { setTheme, signOut } from "@/app/actions";
import { LanguageSwitch } from "@/components/language-switch";
import { CommandPalette } from "@/components/shell/command-palette";
import { Icon } from "@/components/shell/icon";
import {
  AreasGrid,
  BottomBar,
  MenuLink,
  Rail,
  type ShellGroup,
  type ShellPage,
  Subnav,
} from "@/components/shell/nav-client";
import { initialsOf } from "@/lib/initials";
import { getMe, getModules } from "@/lib/viewer";
import { ACCOUNT_PAGE, visibleNav } from "@/nav/nav";

// Khung chung của các trang cần đăng nhập (thiết kế quản trị 2): thanh bên, đầu trang, menu con,
// thanh đáy điện thoại, bảng lệnh. Người dùng và sổ module lấy từ core; phiên không còn hợp lệ
// thì `load` đưa về trang đăng nhập.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  const [me, modules] = await Promise.all([getMe(), getModules()]);

  const nav = visibleNav({
    allPermissions: me.all_permissions,
    permissions: me.permissions,
    modules: modules?.map((m) => m.name) ?? null,
  });
  const groups: ShellGroup[] = nav.map((group) => ({
    id: group.id,
    label: t(`nav.groups.${group.id}`),
    icon: group.icon,
    pages: group.pages.map((page) => ({
      id: page.id,
      label: t(`nav.pages.${page.id}`),
      href: page.href,
      ...(page.exact ? { exact: true } : {}),
    })),
  }));
  const account: ShellPage = {
    id: ACCOUNT_PAGE.id,
    label: t("nav.pages.account"),
    href: ACCOUNT_PAGE.href,
  };
  const who = me.name || me.email;
  const themes = {
    light: t("shell.themeLight"),
    dark: t("shell.themeDark"),
    system: t("shell.themeSystem"),
  };

  return (
    <div className="ax">
      <Rail
        groups={groups}
        labels={{
          home: t("shell.areas"),
          collapse: t("shell.collapse"),
          expand: t("shell.expand"),
          collapseLabel: t("shell.collapseLabel"),
        }}
      />
      <div className="frame">
        <header className="topbar">
          <Link href="/" className="ctx" aria-label={t("shell.home")}>
            <span className="tav">AX</span>
            <span className="ell" style={{ fontWeight: 600 }}>
              {t("app.name")}{" "}
              <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{t("app.admin")}</span>
            </span>
          </Link>
          <button
            type="button"
            className="btn searchbtn"
            popoverTarget="qs"
            aria-label={t("shell.search")}
          >
            <Icon name="search" />
            <span className="hide-mobile ell" style={{ flex: 1, textAlign: "left" }}>
              {t("shell.searchHint")}
            </span>
            <span className="kbd hide-mobile">Ctrl</span>
            <span className="kbd hide-mobile">K</span>
          </button>
          <button
            type="button"
            className="avatar"
            popoverTarget="usermenu"
            aria-label={t("shell.accountMenu", { name: who })}
          >
            {initialsOf(who)}
          </button>
        </header>
        <Subnav groups={groups} />
        <main className="content">{children}</main>
      </div>

      <BottomBar
        groups={groups}
        labels={{
          home: t("nav.groups.home"),
          search: t("shell.searchShort"),
          areas: t("shell.areas"),
          nav: t("shell.quickNav"),
        }}
      />

      <CommandPalette
        groups={groups}
        extra={[account]}
        labels={{
          title: t("shell.search"),
          placeholder: t("shell.searchPlaceholder"),
          goTo: t("shell.goTo"),
          none: t("shell.noMatch"),
        }}
      />

      <div className="axsheet" id="mods" popover="auto" role="dialog" aria-label={t("shell.areas")}>
        <div className="sheet-head">
          <b style={{ flex: 1, fontSize: 15 }}>{t("shell.areas")}</b>
          <button
            type="button"
            className="btn ghost sq"
            popoverTarget="mods"
            popoverTargetAction="hide"
            aria-label={t("shell.close")}
          >
            <Icon name="x" />
          </button>
        </div>
        <AreasGrid groups={groups} />
        <div className="sheet-foot">
          <ThemeForm label={t("shell.theme")} names={themes} />
        </div>
      </div>

      <div
        className="menu"
        id="usermenu"
        popover="auto"
        role="dialog"
        aria-label={t("shell.account")}
      >
        <div className="menu-who">
          <b className="ell">{who}</b>
          <span className="ell" style={{ color: "var(--ink-3)", fontSize: 13 }} data-testid="me">
            {me.email}
          </span>
        </div>
        <MenuLink href={account.href} label={account.label} icon="user" menu="usermenu" />
        <ThemeForm label={t("shell.theme")} names={themes} />
        <div style={{ padding: "6px 10px" }}>
          <LanguageSwitch />
        </div>
        <form action={signOut}>
          <button type="submit" className="menu-item" style={{ width: "100%" }}>
            <Icon name="logout" />
            {t("nav.signOut")}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Chọn sáng / tối / theo máy: mỗi lựa chọn một nút gửi form (chạy cả khi chưa tải JavaScript). */
function ThemeForm({
  label,
  names,
}: {
  label: string;
  names: Record<"light" | "dark" | "system", string>;
}) {
  return (
    <form
      action={setTheme}
      aria-label={label}
      style={{ display: "flex", gap: 6, padding: "6px 10px", width: "100%" }}
    >
      {(["light", "dark", "system"] as const).map((theme) => (
        <button
          key={theme}
          type="submit"
          name="theme"
          value={theme}
          className="btn"
          style={{ flex: 1, height: 36, fontSize: 13 }}
        >
          {names[theme]}
        </button>
      ))}
    </form>
  );
}
