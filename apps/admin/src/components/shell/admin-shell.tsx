import { ApiError } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { leaveTenant } from "@/app/(admin)/workspace-actions";
import { setTheme, signOut } from "@/app/actions";
import { Help } from "@/components/help/help-panel";
import { LanguageSwitch } from "@/components/language-switch";
import { MessagePanel } from "@/components/message-panel";
import { CommandPalette, type CreateShortcut } from "@/components/shell/command-palette";
import { Icon } from "@/components/shell/icon";
import {
  AreasGrid,
  BottomBar,
  MenuLink,
  PlatformBottomBar,
  Rail,
  SellerBottomBar,
  type ShellGroup,
  type ShellPage,
  Subnav,
} from "@/components/shell/nav-client";
import { newsSeen } from "@/help/flags";
import { myFlags } from "@/help/server";
import { currentEntry } from "@/lib/core";
import { initialsOf } from "@/lib/initials";
import { MARKETPLACE_SELL } from "@/lib/market";
import { ordered, typeLabel } from "@/lib/org";
import { currentUnit, loadUnits, loadUnitTypes } from "@/lib/org-server";
import { enabledModuleNames } from "@/lib/plans-server";
import { tenantBlock } from "@/lib/tenant-state";
import { getCurrentTenant, getMe, getModules, getMyTenants } from "@/lib/viewer";
import {
  ACCOUNT_PAGE,
  holds,
  NAV,
  NAV_PLATFORM,
  NAV_SELLER,
  type NavGroup,
  navOf,
  PLATFORM_HOME,
  SELLER_HOME,
  type Viewer,
  visibleNav,
  type Workspace,
} from "@/nav/nav";
import { sampleDataEnabled } from "@/sample";
import { shellCounts } from "@/work/server";
import { OfflineBanner } from "./offline-banner";
import { OrgPicker, type PickerNode } from "./org-picker";
import { TenantBlocked } from "./tenant-blocked";
import "@/components/help/help.css";

// Khung chung của các trang cần đăng nhập (thiết kế quản trị 2): thanh bên, đầu trang, menu con,
// thanh đáy điện thoại, bảng lệnh. Người dùng và sổ module lấy từ core; phiên không còn hợp lệ
// thì `load` đưa về trang đăng nhập.
//
// Hai không gian dùng chung khung này (W-014): không gian của khách (`tenant`, layout `(admin)`)
// và mặt điều khiển nền tảng (`platform`, layout `(platform)`). Mỗi không gian một sổ điều hướng,
// đầu trang và thanh đáy riêng; menu tài khoản có lối sang không gian kia khi người xem dùng được.
// Không gian thứ ba là Trung tâm người bán (`seller`, layout `(seller)`, W-018): `context` là gian
// hàng đang xem, hiện ở đầu trang.
export async function AdminShell({
  workspace,
  context,
  children,
}: {
  workspace: Workspace;
  context?: { title: string; sub: string };
  children: ReactNode;
}) {
  const t = await getTranslations();
  let loaded: Awaited<ReturnType<typeof loadViewer>>;
  const entered = await currentEntry();
  // Khách đang vào không còn trong danh sách vào được (uỷ quyền / quyền vào hỗ trợ đã thu hồi hay hết
  // hạn): báo trước khi trang gọi core và nhận 403 `tenant_mismatch`.
  if (entered && !(await getMyTenants()).some((x) => x.id === entered && x.access !== "direct")) {
    return <EntryEnded detail="" />;
  }
  try {
    loaded = await loadViewer();
  } catch (error) {
    // Đang vào khách khác mà uỷ quyền / quyền vào hỗ trợ đã hết: core trả `tenant_mismatch`.
    if (entered && error instanceof ApiError && error.problem.code === "tenant_mismatch") {
      return <EntryEnded detail={error.problem.detail} />;
    }
    // Khách bị tạm khoá hay đang bảo trì: mọi lời gọi đều bị từ chối, thay cả khung bằng trang báo.
    const block = tenantBlock(error);
    if (block && error instanceof ApiError) {
      return <TenantBlocked block={block} detail={error.problem.detail} />;
    }
    throw error;
  }
  const [me, installed, current] = loaded;
  const modules = await enabledModuleNames(installed);
  const mine = workspace === "tenant" ? await getMyTenants() : [];
  // Khách khác người dùng vào được; đang ở khách khác thì có cả khách của mình để quay về.
  const switchTo = mine.filter((x) => x.id !== current?.id);
  const entry = entered ? mine.find((x) => x.id === entered) : undefined;
  const picker = workspace === "tenant" ? await orgPicker(t, current, switchTo.length > 0) : null;
  const viewer: Viewer = {
    // Ở khách khác core chưa cho biết quyền của người dùng (xem `getViewer`): không ẩn gì.
    allPermissions: entered ? true : me.all_permissions,
    permissions: me.permissions,
    modules,
    sample: sampleDataEnabled(),
  };
  // Số đếm cạnh tên màn (W-020): từ cùng sổ nguồn việc với hộp việc; chỉ không gian của khách có.
  // Không `await`: khung hiện ngay, số đếm tới sau qua `Suspense` ở phía trình duyệt.
  const counts = workspace === "tenant" ? shellCounts() : undefined;
  // "Có gì mới" đã xem (cờ D-207 của core, W-023): cũng không `await`, nút "?" nhận promise.
  const newsSeenUpTo = myFlags().then(newsSeen);
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
  const seller = workspace === "seller";
  const groups = shellGroups(navOf(workspace));
  // Lối sang không gian khác: mặt điều khiển chỉ khi người xem thấy ít nhất một màn của nó; Trung tâm
  // người bán cho người bán thật, hay "Xem như người bán" cho người xem được hồ sơ người bán (W-018).
  const others: { page: ShellPage; icon: "home" | "scope" | "store" }[] = [];
  const toTenant = { id: "tenantSpace", label: t("platform.shell.toTenant"), href: "/" };
  if (workspace === "tenant") {
    // Mặt điều khiển chỉ cho nhân sự của khách nền tảng (`GET /kernel/tenant`); core cũ không trả
    // được thì theo permission như trước.
    if (current?.platform !== false && shellGroups(NAV_PLATFORM).length > 0) {
      others.push({
        page: { id: "platformSpace", label: t("platform.shell.toPlatform"), href: PLATFORM_HOME },
        icon: "scope",
      });
    }
    if (shellGroups(NAV_SELLER).length > 0) {
      const own = me.permissions.includes(MARKETPLACE_SELL);
      others.push({
        page: {
          id: "sellerSpace",
          label: own ? t("seller.shell.toSeller") : t("seller.shell.preview"),
          href: SELLER_HOME,
        },
        icon: "store",
      });
    }
  } else if (platform) {
    others.push({ page: toTenant, icon: "home" });
  } else if (
    // Người bán chỉ có quyền bán thì không gian của khách gần như trống: không mời sang đó.
    visibleNav(viewer, NAV).some((g) => g.id !== "home" && g.id !== "settings")
  ) {
    others.push({ page: toTenant, icon: "home" });
  }
  // Lối tắt "Tạo mới" của Ctrl K (thiết kế "Khung quản trị"): chỉ ở không gian của khách, chỉ khi người
  // xem có permission tạo và thấy màn chứa nó (module đã cài). Core vẫn kiểm ở mỗi lời gọi.
  const visible = (href: string) => groups.some((g) => g.pages.some((p) => p.href === href));
  const create: CreateShortcut[] =
    workspace === "tenant"
      ? (
          [
            ["newPost", "/content/new", "/content", ["content.write", "content.write_own"]],
            [
              "newPage",
              "/content/new?kind=page",
              "/content",
              ["content.write", "content.write_own"],
            ],
            [
              "newCampaign",
              "/marketing/newsletter/campaigns/new",
              "/marketing/newsletter",
              ["newsletter.manage"],
            ],
            ["newRole", "/org/access/roles/new", "/org/access", ["auth.roles.manage"]],
          ] as const
        )
          .filter(([, , area, permission]) => visible(area) && holds(viewer, permission))
          .map(([id, href]) => ({
            key: `create/${id}`,
            label: t(`shell.create.${id}`),
            context: "",
            href,
          }))
      : [];
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
        home={platform ? PLATFORM_HOME : seller ? SELLER_HOME : "/"}
        {...(platform ? { tag: t("platform.shell.tag") } : {})}
        {...(seller ? { tag: t("seller.shell.tag") } : {})}
        labels={{
          home: platform
            ? t("platform.shell.rail")
            : seller
              ? t("seller.shell.rail")
              : t("shell.areas"),
          collapse: t("shell.collapse"),
          expand: t("shell.expand"),
          collapseLabel: t("shell.collapseLabel"),
          pending: t("shell.pending"),
        }}
        {...(counts ? { counts } : {})}
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
          ) : seller ? (
            <Link href={SELLER_HOME} className="ctx pf-ctx" aria-label={t("seller.shell.home")}>
              <span className="tav">{initialsOf(context?.title ?? "")}</span>
              <span className="pf-ctx-text">
                <span className="ell" style={{ fontWeight: 600 }}>
                  {context?.title ?? t("seller.shell.name")}
                </span>
                <span className="ell pf-ctx-sub">{context?.sub ?? t("seller.shell.sub")}</span>
              </span>
            </Link>
          ) : picker ? (
            <OrgPicker
              title={picker.title}
              tenant={picker.tenant}
              nodes={picker.nodes}
              current={picker.current}
              others={switchTo.map((x) => ({
                id: x.id,
                name: x.name,
                slug: x.slug,
                access: x.access,
              }))}
            />
          ) : (
            <Link href="/" className="ctx" aria-label={t("shell.home")}>
              {/* Core nhiều khách: tên khách đang làm việc (`GET /kernel/tenant`), như thiết kế. Một khách
                  thì tên ứng dụng như trước. Cây có nhiều nút thì thay bằng bộ chọn nút (`OrgPicker`). */}
              {current?.mode === "multi" ? (
                <>
                  <span className="tav">{initialsOf(current.name)}</span>
                  <span className="ell" style={{ fontWeight: 600 }} data-testid="tenant-name">
                    {current.name}{" "}
                    <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{t("app.admin")}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="tav">AX</span>
                  <span className="ell" style={{ fontWeight: 600 }}>
                    {t("app.name")}{" "}
                    <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>{t("app.admin")}</span>
                  </span>
                </>
              )}
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
          <Help seen={newsSeenUpTo} />
          <button
            type="button"
            className="avatar"
            popoverTarget="usermenu"
            aria-label={t("shell.accountMenu", { name: who })}
          >
            {initialsOf(who)}
          </button>
        </header>
        <Subnav groups={groups} {...(counts ? { counts } : {})} />
        <main className="content">
          {/* Khách của người đăng nhập đang chỉ đọc (D-296 của core): báo trước, để lệnh ghi bị từ
              chối (`403 tenant_read_only`, hiện `detail` của core) không làm người dùng bất ngờ. */}
          <OfflineBanner />
          {current?.read_only ? (
            <p className="note warn" role="status" data-testid="read-only-banner">
              <b>{t("shell.readOnlyTitle")}</b> {t("shell.readOnlyBody")}
            </p>
          ) : null}
          {/* Role bắt buộc xác thực hai bước mà tài khoản chưa bật: core bỏ permission của role đó
              (D-308), người dùng vẫn đăng nhập được để bật. */}
          {entered && workspace === "tenant" ? (
            <div className="note warn" role="status" data-testid="entered-banner">
              {t("shell.entered.text", {
                name: entry?.name ?? current?.name ?? "",
                access: t(`shell.org.access.${entry?.access ?? "delegation"}`),
              })}{" "}
              <form action={leaveTenant} style={{ display: "inline" }}>
                <button type="submit" className="btn sm">
                  {t("shell.entered.leave")}
                </button>
              </form>
            </div>
          ) : null}
          {me.mfa_required ? (
            <p className="note warn" role="status" data-testid="mfa-banner">
              <b>{t("shell.mfaTitle")}</b> {t("shell.mfaBody")}{" "}
              <Link href="/account/security">{t("shell.mfaLink")}</Link>
            </p>
          ) : null}
          {children}
        </main>
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
      ) : seller ? (
        <SellerBottomBar
          groups={groups}
          labels={{
            shop: t("seller.shell.bottomShop"),
            money: t("seller.shell.bottomMoney"),
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
        extra={[{ ...account, icon: "user" }, ...others.map((o) => ({ ...o.page, icon: o.icon }))]}
        create={create}
        labels={{
          title: t("shell.search"),
          placeholder: t("shell.searchPlaceholder"),
          goTo: t("shell.goTo"),
          none: t("shell.noMatch"),
          create: t("shell.createNew"),
          results: t("shell.results.title"),
          searching: t("shell.results.searching"),
          recent: t("shell.recent"),
          areas: t("shell.areas"),
          keyMove: t("shell.keys.move"),
          keyOpen: t("shell.keys.open"),
          keyClose: t("shell.close"),
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
        <AreasGrid groups={groups} pending={t("shell.pending")} {...(counts ? { counts } : {})} />
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
        {others.map((o) => (
          <MenuLink
            key={o.page.id}
            href={o.page.href}
            label={o.page.label}
            icon={o.icon}
            menu="usermenu"
          />
        ))}
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

/**
 * Dữ liệu của bộ chọn nút góc trên trái: chỉ khi người xem đọc được cây (`organizations.units.read`)
 * và cây có hơn một nút. Không thì `null` (khung giữ link về Tổng quan như trước).
 */
async function orgPicker(
  t: Awaited<ReturnType<typeof getTranslations>>,
  current: Awaited<ReturnType<typeof getCurrentTenant>>,
  /** Có khách khác để chuyển sang: hiện bộ chọn cả khi cây chỉ có một nút. */
  switchable: boolean,
): Promise<{
  title: string;
  tenant: boolean;
  nodes: PickerNode[];
  current: string | null;
} | null> {
  const units = await loadUnits();
  const all = units ? ordered(units).filter(({ unit }) => unit.status !== "archived") : [];
  if (all.length < 2 && !switchable) return null;
  // Cây chỉ một nút: không có gì để chọn trong khách, chỉ còn mục khách khác.
  const tree = all.length < 2 ? [] : all;
  const types = await loadUnitTypes();
  const typeName = (code: string) =>
    typeLabel(types, code, (c) => (t.has(`orgtree.types.${c}`) ? t(`orgtree.types.${c}`) : null));
  return {
    title: current?.mode === "multi" ? current.name : t("app.name"),
    tenant: current?.mode === "multi",
    nodes: tree.map(({ unit, depth }) => ({
      id: unit.id,
      name: unit.name,
      type: typeName(unit.unit_type),
      depth,
    })),
    current: (await currentUnit())?.id ?? null,
  };
}

/** Người đăng nhập, sổ module và khách của request, đọc song song. */
function loadViewer() {
  return Promise.all([getMe(), getModules(), getCurrentTenant()]);
}

/** Uỷ quyền / quyền vào hỗ trợ của khách đang vào đã hết: báo và cho quay về khách của mình. */
async function EntryEnded({ detail }: { detail: string }) {
  const t = await getTranslations("shell.entered");
  return (
    <div className="ax" data-testid="entry-ended">
      <main className="content">
        <MessagePanel title={t("endedTitle")} message={t("endedBody")}>
          {detail ? <p className="fhint">{detail}</p> : null}
          <form action={leaveTenant}>
            <button type="submit" className="btn pri">
              {t("leave")}
            </button>
          </form>
        </MessagePanel>
      </main>
    </div>
  );
}
