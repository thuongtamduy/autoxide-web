"use client";

// Phần điều hướng cần biết địa chỉ đang mở (usePathname) nên chạy ở trình duyệt. Dữ liệu
// (nhóm, màn, nhãn đã dịch) do layout tính ở máy chủ rồi truyền xuống, không chứa token.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activePage, type NavGroup } from "@/nav/nav";
import { Icon, type IconName } from "./icon";

export interface ShellPage {
  id: string;
  label: string;
  href: string;
  exact?: boolean;
}

export interface ShellGroup {
  id: string;
  label: string;
  icon: IconName;
  pages: ShellPage[];
}

function useActive(groups: ShellGroup[]) {
  const pathname = usePathname();
  // activePage chỉ cần id / href / exact: ShellGroup đủ các trường đó.
  return activePage(groups as unknown as NavGroup[], pathname);
}

/** Thanh bên: một mục cho mỗi phân hệ, trỏ tới màn đầu của phân hệ. */
export function Rail({
  groups,
  labels,
}: {
  groups: ShellGroup[];
  labels: { home: string; collapse: string; expand: string; collapseLabel: string };
}) {
  const active = useActive(groups);
  return (
    <nav className="rail" aria-label={labels.home}>
      <Link href="/" className="rail-logo" aria-label="Autoxide">
        <span className="rail-mark">
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 22, height: 22 }}>
            <circle
              cx="11"
              cy="13"
              r="6"
              style={{ fill: "none", stroke: "#F2F3F6", strokeWidth: 2.4 }}
            />
            <circle cx="18" cy="6" r="2.8" style={{ fill: "#F0703A" }} />
          </svg>
        </span>
        <span className="rail-name">Autoxide</span>
      </Link>
      <div className="rail-mid">
        {groups.map((group) => {
          const on = active?.group.id === group.id;
          const first = group.pages[0];
          if (!first) return null;
          return (
            <Link
              key={group.id}
              href={first.href}
              className={on ? "ri on" : "ri"}
              aria-current={on ? "page" : undefined}
            >
              <Icon name={group.icon} />
              <span>{group.label}</span>
            </Link>
          );
        })}
      </div>
      <label className="ri rail-toggle">
        <input type="checkbox" className="railmini" aria-label={labels.collapseLabel} />
        <Icon name="collapse" />
        <span className="t-full">{labels.collapse}</span>
        <span className="t-mini">{labels.expand}</span>
      </label>
    </nav>
  );
}

/** Menu con của phân hệ đang mở: các màn của phân hệ. Phân hệ chỉ có một màn thì không hiện. */
export function Subnav({ groups }: { groups: ShellGroup[] }) {
  const active = useActive(groups);
  if (!active || active.group.pages.length < 2) return null;
  const group = groups.find((g) => g.id === active.group.id);
  if (!group) return null;
  return (
    <nav className="subnav" aria-label={group.label}>
      <span className="gname">{group.label}</span>
      {group.pages.map((page) => {
        const on = active.page.id === page.id;
        return (
          <Link
            key={page.id}
            href={page.href}
            className={on ? "stab on" : "stab"}
            aria-current={on ? "page" : undefined}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Thanh đáy điện thoại: Tổng quan, Tìm (bảng lệnh), Phân hệ (mọi phân hệ). */
export function BottomBar({
  groups,
  labels,
}: {
  groups: ShellGroup[];
  labels: { home: string; search: string; areas: string; nav: string };
}) {
  const active = useActive(groups);
  const atHome = active?.group.id === "home";
  return (
    <nav className="bottombar" aria-label={labels.nav}>
      <Link
        href="/"
        className={atHome ? "on" : undefined}
        aria-current={atHome ? "page" : undefined}
      >
        <Icon name="home" />
        {labels.home}
      </Link>
      <button type="button" popoverTarget="qs">
        <Icon name="search" />
        {labels.search}
      </button>
      <button type="button" popoverTarget="mods" className={atHome ? undefined : "on"}>
        <Icon name="grid" />
        {labels.areas}
      </button>
    </nav>
  );
}

/** Bảng "Phân hệ" (điện thoại): lưới mọi phân hệ, phân hệ đang mở được tô. */
export function AreasGrid({ groups }: { groups: ShellGroup[] }) {
  const active = useActive(groups);
  return (
    <div className="mods-grid">
      {groups.map((group) => {
        const first = group.pages[0];
        if (!first) return null;
        const on = active?.group.id === group.id;
        return (
          <Link
            key={group.id}
            href={first.href}
            className={on ? "mod on" : "mod"}
            onClick={() => document.getElementById("mods")?.hidePopover()}
          >
            <Icon name={group.icon} />
            <span>{group.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** Mục là link trong menu tài khoản: bấm thì đóng menu (menu nằm ở khung, không tự đóng khi đổi trang). */
export function MenuLink({
  href,
  label,
  icon,
  menu,
}: {
  href: string;
  label: string;
  icon: IconName;
  menu: string;
}) {
  const pathname = usePathname();
  const on = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className="menu-item"
      aria-current={on ? "page" : undefined}
      onClick={() => document.getElementById(menu)?.hidePopover()}
    >
      <Icon name={icon} />
      {label}
    </Link>
  );
}
