// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Help, HelpView } from "@/components/help/help-panel";
import { InfoTip, TipHeading } from "@/components/help/info-tip";
import { IntroCard } from "@/components/help/intro-card";
import { latestVersion } from "@/help/whats-new";
import { renderIntl } from "@/test/render";

const actions = vi.hoisted(() => ({
  dismissHint: vi.fn().mockResolvedValue(true),
  markNewsSeen: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/help/actions", () => actions);
vi.mock("next/navigation", () => ({ usePathname: () => "/sales/orders" }));

// jsdom chưa có popover API: thay bằng hàm giả để kiểm nút gọi đúng hộp.
const show = vi.fn();
const hide = vi.fn();
beforeEach(() => {
  Object.assign(HTMLElement.prototype, { showPopover: show, hidePopover: hide });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Như trình duyệt khi popover mở / đóng. */
function toggle(el: HTMLElement, newState: "open" | "closed") {
  const event = new Event("toggle");
  Object.assign(event, { newState });
  act(() => {
    el.dispatchEvent(event);
  });
}

describe("InfoTip", () => {
  it("nút ⓘ mở đúng hộp; hộp có tiêu đề, giải thích, ví dụ và nút đóng", () => {
    renderIntl(<InfoTip id="saved_views" />);
    const button = screen.getByRole("button", { name: "Explain: Saved views" });
    const box = document.getElementById("tip-saved_views");
    expect(button.getAttribute("popovertarget")).toBe("tip-saved_views");
    expect(box?.getAttribute("popover")).toBe("auto");
    expect(box?.textContent).toContain("What is a view?");
    expect(box?.textContent).toContain("Example:");
    const ok = screen.getByRole("button", { name: "Got it", hidden: true });
    expect(ok.getAttribute("popovertarget")).toBe("tip-saved_views");
    expect(ok.getAttribute("popovertargetaction")).toBe("hide");
  });

  it("Tìm hiểu thêm đóng hộp rồi mở bảng Trợ giúp", () => {
    renderIntl(
      <>
        <InfoTip id="depth" />
        <div id="help" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Learn more/, hidden: true }));
    expect(hide).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.contexts[0]).toBe(document.getElementById("help") ?? undefined);
  });

  it("hộp không có ví dụ thì không có khung ví dụ; tiêu đề giữ đúng tên", () => {
    renderIntl(
      <TipHeading id="h" tip="inherit">
        Effective settings
      </TipHeading>,
    );
    expect(screen.getByRole("heading").textContent).toBe("Effective settings");
    expect(document.querySelector(".tip-ex")).toBeNull();
  });
});

describe("IntroCard", () => {
  it("Đã hiểu ẩn thẻ ngay và ghi cờ của gợi ý", async () => {
    renderIntl(<IntroCard id="saved_views" />);
    expect(screen.getByRole("note").textContent).toContain("Save views for filters you use often.");
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("note")).toBeNull();
    await vi.waitFor(() => expect(actions.dismissHint).toHaveBeenCalledWith("saved_views"));
  });
});

describe("Help", () => {
  it("có tin chưa xem: chấm trên nút; mở bảng thì chấm mất và ghi đã xem một lần", async () => {
    renderIntl(<HelpView seen={null} />);
    expect(screen.getByTestId("help-dot")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Help for this page, with news you have not seen" }),
    ).toBeTruthy();
    const panel = document.getElementById("help") as HTMLElement;
    toggle(panel, "open");
    expect(screen.queryByTestId("help-dot")).toBeNull();
    await vi.waitFor(() => expect(actions.markNewsSeen).toHaveBeenCalledTimes(1));
    toggle(panel, "closed");
    toggle(panel, "open");
    expect(actions.markNewsSeen).toHaveBeenCalledTimes(1);
    // Nhãn "New" còn trên tin lúc đang đọc.
    expect(panel.querySelectorAll(".hp-news .intro-badge").length).toBeGreaterThan(0);
  });

  it("nhận promise từ máy chủ: nút hiện ngay, có cờ thì hiện chấm", async () => {
    renderIntl(<Help seen={Promise.resolve(null)} />);
    expect(screen.getByRole("button", { name: /^Help for this page/ })).toBeTruthy();
    expect(await screen.findByTestId("help-dot")).toBeTruthy();
  });

  it("cờ tới sau khi bảng đã mở: bảng giữ nguyên, không dựng lại", async () => {
    let resolve: (value: string | null) => void = () => {};
    renderIntl(<Help seen={new Promise((r) => (resolve = r))} />);
    const panel = document.getElementById("help") as HTMLElement;
    toggle(panel, "open");
    const box = screen.getByRole("searchbox", { hidden: true });
    fireEvent.change(box, { target: { value: "refund" } });
    await act(async () => resolve(null));
    expect(document.getElementById("help")).toBe(panel);
    expect((screen.getByRole("searchbox", { hidden: true }) as HTMLInputElement).value).toBe(
      "refund",
    );
    expect(await screen.findByTestId("help-dot")).toBeTruthy();
  });

  it("đã xem tin mới nhất: không chấm, mở bảng không ghi gì", () => {
    renderIntl(<HelpView seen={latestVersion()} />);
    expect(screen.queryByTestId("help-dot")).toBeNull();
    toggle(document.getElementById("help") as HTMLElement, "open");
    expect(actions.markNewsSeen).not.toHaveBeenCalled();
  });

  it("bài của trang đang mở; tìm thì thấy bài của trang khác", () => {
    renderIntl(<HelpView seen={latestVersion()} />);
    const panel = document.getElementById("help") as HTMLElement;
    expect(panel.getAttribute("aria-label")).toBe("Help · Orders");
    expect(panel.textContent).toContain("Refunds and returns");
    expect(panel.textContent).not.toContain("Inviting members");
    fireEvent.change(screen.getByRole("searchbox", { hidden: true }), {
      target: { value: "inviting" },
    });
    const link = screen.getByRole("link", { name: /Inviting members/, hidden: true });
    expect(link.getAttribute("href")).toBe("/org/access/invitations");
    fireEvent.change(screen.getByRole("searchbox", { hidden: true }), {
      target: { value: "zzz" },
    });
    expect(panel.textContent).toContain("No guide matches.");
  });

  it("phím ? mở bảng, trừ khi đang gõ chữ", () => {
    renderIntl(
      <>
        <input aria-label="field" />
        <HelpView seen={latestVersion()} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "?" });
    expect(show).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "?" });
    expect(show).toHaveBeenCalledTimes(1);
  });
});
