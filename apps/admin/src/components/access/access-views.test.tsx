// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SampleBadge } from "@/components/sample-badge";
import { PageTabs } from "@/components/ui/page-tabs";
import { renderIntl } from "@/test/render";
import { RoleEditor } from "./role-editor";

vi.mock("next/navigation", () => ({ usePathname: () => "/org/access/users/123" }));
// Server Action không chạy được trong jsdom; editor chỉ cần tham chiếu tới chúng.
vi.mock("@/app/(admin)/org/access/actions", () => ({
  createRole: vi.fn(),
  updateRole: vi.fn(),
}));

afterEach(cleanup);

const CATALOG = [
  { name: "auth.roles.read", description: "See roles." },
  { name: "auth.users.read", description: "Xem tài khoản." },
  { name: "notes.write", description: "Write notes." },
];

describe("RoleEditor", () => {
  it("nhóm theo module, đếm số đã chọn, chọn hết một module", () => {
    renderIntl(<RoleEditor catalog={CATALOG} editable />);

    expect(screen.getByTestId("chosen-count").textContent).toBe("0 of 3 chosen");
    fireEvent.click(screen.getByRole("button", { name: "Choose all of auth" }));
    expect(screen.getByTestId("chosen-count").textContent).toBe("2 of 3 chosen");
    expect((screen.getByLabelText(/auth\.users\.read/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear auth" }));
    expect(screen.getByTestId("chosen-count").textContent).toBe("0 of 3 chosen");
  });

  it("ô tìm ẩn permission không khớp (không dấu) nhưng vẫn giữ trong form", () => {
    renderIntl(
      <RoleEditor
        catalog={CATALOG}
        role={{ id: "r", name: "editor", description: "", permissions: ["notes.write"] }}
        editable
      />,
    );
    fireEvent.change(screen.getByLabelText("Find permissions"), { target: { value: "tai khoan" } });
    const notes = screen.getByDisplayValue("notes.write") as HTMLInputElement;
    expect(notes.closest("label")?.hidden).toBe(true);
    expect(notes.checked).toBe(true);
    expect(screen.getByLabelText(/auth\.users\.read/).closest("label")?.hidden).toBe(false);

    fireEvent.change(screen.getByLabelText("Find permissions"), { target: { value: "zzz" } });
    expect(screen.getByText("No permission matches “zzz”.")).toBeTruthy();
  });

  it("chỉ xem: ô bị khoá, không có nút lưu", () => {
    renderIntl(<RoleEditor catalog={CATALOG} editable={false} />);
    expect((screen.getByLabelText(/notes\.write/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Create role" })).toBeNull();
  });
});

describe("PageTabs", () => {
  it("tab `nested` sáng ở trang con; nhãn phụ hiện cạnh tên", () => {
    renderIntl(
      <PageTabs
        label="Sections"
        tabs={[
          { href: "/org/access/users", label: "Users", nested: true },
          { href: "/org/access/invitations", label: "Invitations", badge: "sample" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Users" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Invitations/ }).textContent).toBe("Invitationssample");
  });
});

describe("SampleBadge", () => {
  it("ghi bước chờ và endpoint còn thiếu, theo ngôn ngữ", () => {
    renderIntl(<SampleBadge step="34" endpoint="GET /api/v1/auth/invitations" />, "vi");
    const badge = screen.getByText("Dữ liệu mẫu · chờ API bước 34");
    expect(badge.getAttribute("title")).toContain("GET /api/v1/auth/invitations");
  });
});
