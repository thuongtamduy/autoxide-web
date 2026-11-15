// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Time } from "@/components/ui/time";
import { renderIntl } from "@/test/render";
import { Field, FormAlert } from "./form";
import { RecoveryCodes } from "./recovery-codes";
import { AccountTabs } from "./tabs";

vi.mock("next/navigation", () => ({ usePathname: () => "/account/security" }));

afterEach(cleanup);

describe("Field", () => {
  it("ô sai có aria-invalid và lỗi ngay dưới, gắn bằng aria-describedby", () => {
    renderIntl(<Field label="Current password" name="current_password" error="Wrong." />);

    const input = screen.getByLabelText("Current password");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = input.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(described)?.textContent).toBe("Wrong.");
  });

  it("ô đúng không có aria-invalid", () => {
    renderIntl(<Field label="Name" name="name" hint="A hint" />);

    expect(screen.getByLabelText("Name").hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("FormAlert", () => {
  it("lỗi của core hiện detail và giữ code", () => {
    renderIntl(<FormAlert state={{ error: "Too fast.", code: "auth.login_throttled" }} />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Too fast.");
    expect(alert.getAttribute("data-code")).toBe("auth.login_throttled");
  });

  it("chỉ có lỗi ở ô thì đếm số ô, theo ngôn ngữ", () => {
    renderIntl(<FormAlert state={{ fields: { a: "x", b: "y" } }} />, "vi");

    expect(screen.getByRole("alert").textContent).toBe("Còn 2 ô cần sửa.");
  });

  it("không có lỗi thì không hiện gì", () => {
    renderIntl(<FormAlert state={{ done: 1 }} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("RecoveryCodes", () => {
  it("hiện mọi mã, chép và tải về", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const close = vi.fn();
    renderIntl(<RecoveryCodes codes={["aaaa-bbbb", "cccc-dddd"]} close={close} />);

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "aaaa-bbbb",
      "cccc-dddd",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("aaaa-bbbb\ncccc-dddd\n");
    expect(await screen.findByText("Copied.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I stored them" }));
    expect(close).toHaveBeenCalled();
  });
});

describe("AccountTabs", () => {
  it("tab của đường dẫn đang mở được đánh dấu", () => {
    renderIntl(
      <AccountTabs
        label="Sections"
        tabs={[
          { href: "/account", label: "Profile" },
          { href: "/account/security", label: "Security" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Security" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Profile" }).hasAttribute("aria-current")).toBe(false);
  });
});

describe("Time", () => {
  it("ghi thời điểm máy đọc được và chữ theo ngôn ngữ", () => {
    renderIntl(<Time value="2026-11-15T04:16:00Z" />);

    const time = document.querySelector("time");
    expect(time?.getAttribute("dateTime")).toBe("2026-11-15T04:16:00Z");
    expect(time?.textContent).toMatch(/2026/);
  });
});
