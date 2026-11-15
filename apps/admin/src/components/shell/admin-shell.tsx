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
  PlatformBottomBar,
  Rail,
  type ShellGroup,
  type ShellPage,
  Subnav,
} from "@/components/shell/nav-client";
import { initialsOf } from "@/lib/initials";
import { getMe, getModules } from "@/lib/viewer";
import {
  ACCOUNT_PAGE,
  NAV,
  NAV_PLATFORM,
  type NavGroup,
  PLATFORM_HOME,
  type Viewer,
  visibleNav,
  type Workspace,
} from "@/nav/nav";
import { sampleDataEnabled } from "@/sample";

// Khung chung của các trang cần đăng nhập (thiết kế quản trị 2): thanh bên, đầu trang, menu con,
// thanh đáy điện thoại, bảng lệnh. Người dùng và sổ module lấy từ core; phiên không còn hợp lệ
// thì `load` đưa về trang đăng nhập.
//
// Hai không gian dùng chung khung này (W-014): không gian của khách (`tenant`, layout `(admin)`)
// và mặt điều khiển nền tảng (`platform`, layout `(platform)`). Mỗi không gian một sổ điều hướng,
// đầu trang và thanh đáy riêng; menu tài khoản có lối sang không gian kia khi người xem dùng được.
export async function AdminShell({
  workspace,
  children,
}: {
  workspace: Workspace;
  children: ReactNode;
}) {
  const t = await getTranslations();
  const [me, modules] = await Promise.all([getMe(), getModules()]);
  const viewer: Viewer = {
    allPermissions: me.all_permissions,
    permissions: me.permissions,
    modules: modules?.map((m) => m.name) ?? null,
    sample: sampleDataEnabled(),
  };
  const shellGroups = (nav: NavGroup[]): ShellGroup[] =>
    visibleNav(viewer, nav).map((group) => ({
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
  const platform = workspace === "platform";
  const groups = shellGroups(platform ? NAV_PLATFORM : NAV);
  // Lối sang không gian kia: mặt điều khiển chỉ khi người xem thấy ít nhất một màn của nó.
  const other: ShellPage | null = platform
    ? { id: "tenantSpace", label: t("platform.shell.toTenant"), href: "/" }
    : (() => {
        const first = shellGroups(NAV_PLATFORM)[0]?.pages[0];
        return first
          ? { id: "platformSpace", label: t("platform.shell.toPlatform"), href: PLATFORM_HOME }
          : null;
      })();
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
    <div className="ax" data-workspace={workspace}>
      <Rail
        groups={groups}
        home={platform ? PLATFORM_HOME : "/"}
        {...(platform ? { tag: t("platform.shell.tag") } : {})}
        labels={{
          home: platform ? t("platform.shell.rail") : t("shell.areas"),
          collapse: t("shell.collapse"),
          expand: t("shell.expand"),
          collapseLabel: t("shell.collapseLabel"),
        }}
      />
      <div className="frame">
        <header className="topbar">
          {platform ? (
            <Link href={PLATFORM_HOME} className="ctx pf-ctx" aria-label={t("platform.shell.home")}>
              <span className="tav">AX</span>
              <span className="pf-ctx-text">
                <span className="ell" style={{ fontWeight: 600 }}>
                  {t("platform.shell.name")}
                </span>
                <span className="ell pf-ctx-sub">{t("platform.shell.sub")}</span>
              </span>
            </Link>
          ) : (
            <Link href="/" className="ctx" aria-label={t("shell.home")}>
              <span className="tav">AX</span>
              <span className="ell" style={{ fontWeight: 600 }}>
                {t("app.name")}{" "}
                <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{t("app.admin")}</span>
              </span>
            </Link>
          )}
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
          {platform ? <ScopeNote /> : null}
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

      {platform ? (
        <PlatformBottomBar
          groups={groups}
          labels={{
            tenants: t("platform.shell.bottomTenants"),
            ops: t("platform.shell.bottomOps"),
            search: t("shell.searchShort"),
            areas: t("shell.areas"),
            nav: t("shell.quickNav"),
          }}
        />
      ) : (
        <BottomBar
          groups={groups}
          labels={{
            home: t("nav.groups.home"),
            search: t("shell.searchShort"),
            areas: t("shell.areas"),
            nav: t("shell.quickNav"),
          }}
        />
      )}

      <CommandPalette
        groups={groups}
        extra={other ? [account, other] : [account]}
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
        {other ? (
          <MenuLink
            href={other.href}
            label={other.label}
            icon={platform ? "home" : "scope"}
            menu="usermenu"
          />
        ) : null}
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

/**
 * Nhãn khiên ở đầu mặt điều khiển: nhân sự nền tảng không thấy dữ liệu nghiệp vụ của khách; muốn
 * xem để hỗ trợ thì xin quyền vào có hạn, có lý do (bước 34). Popover của HTML: Esc, bấm ra ngoài.
 */
async function ScopeNote() {
  const t = await getTranslations("platform.shell");
  return (
    <>
      <button
        type="button"
        className="btn ghost sq pf-scope"
        popoverTarget="pf-scope"
        aria-label={t("scopeLabel")}
        title={t("scopeTitle")}
      >
        <Icon name="scope" />
      </button>
      <div
        className="menu pf-scope-tip"
        id="pf-scope"
        popover="auto"
        role="dialog"
        aria-label={t("scopeTitle")}
      >
        <b>{t("scopeTitle")}</b>
        <p>{t("scopeBody")}</p>
        <div className="pf-scope-acts">
          <MenuLink href="/platform/support" label={t("scopeMore")} icon="key" menu="pf-scope" />
          <button
            type="button"
            className="btn sm pri"
            popoverTarget="pf-scope"
            popoverTargetAction="hide"
          >
            {t("scopeOk")}
          </button>
        </div>
      </div>
    </>
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
