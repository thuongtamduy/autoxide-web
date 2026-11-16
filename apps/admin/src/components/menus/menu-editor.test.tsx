// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { SiteMenu } from "@/lib/menus";
import en from "../../../messages/en.json";
import { MenuEditor } from "./menu-editor";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/app/(admin)/content/menus/actions", () => ({ saveMenu: vi.fn() }));

afterEach(cleanup);

const AT = "2026-11-15T00:00:00Z";

function menu(labels: string[]): SiteMenu {
  return {
    id: "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a81",
    key: "main",
    locale: "vi",
    created_at: AT,
    updated_at: AT,
    items: labels.map((label, i) => ({
      id: `0193a0c4-7d1e-7c2a-9b1e-00000000000${i}`,
      label,
      url: `/muc-${i}`,
      auto_children: false,
      children: [],
    })),
  };
}

function view(saved: SiteMenu, etag: string) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <ToastProvider>
        <MenuEditor menu={saved} etag={etag} kinds={[]} objects={[]} live={null} now={AT} />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

const rowLabels = () =>
  [...document.querySelectorAll(".mn-rowbtn")].map((el) => el.textContent ?? "");

describe("MenuEditor khi trang làm mới (bản mới từ máy chủ)", () => {
  it("bản nháp đang sửa không bao giờ bị bản của người khác ghi đè; tải bản mới thì mới thay", () => {
    const { rerender } = render(view(menu(["Khuyến mại"]), '"1"'));
    fireEvent.change(screen.getByLabelText("Label", { exact: true }), {
      target: { value: "Giảm giá tháng này" },
    });
    rerender(view(menu(["Khuyến mại", "Người khác thêm"]), '"2"'));
    expect(rowLabels().join(" ")).toContain("Giảm giá tháng này");
    expect(rowLabels().join(" ")).not.toContain("Người khác thêm");
    expect(screen.getByRole("alert").textContent).toContain(en.menus.editor.conflictRemote);

    fireEvent.click(screen.getByRole("button", { name: "Load the new version" }));
    expect(rowLabels().join(" ")).toContain("Người khác thêm");
    expect(rowLabels().join(" ")).not.toContain("Giảm giá tháng này");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("bản nháp chưa sửa gì thì nhận bản mới ngay, không báo xung đột", () => {
    const { rerender } = render(view(menu(["Khuyến mại"]), '"1"'));
    rerender(view(menu(["Khuyến mại", "Người khác thêm"]), '"2"'));
    expect(rowLabels().join(" ")).toContain("Người khác thêm");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
