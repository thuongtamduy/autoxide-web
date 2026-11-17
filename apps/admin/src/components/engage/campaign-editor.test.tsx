// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { FormState } from "@/lib/form";
import { renderIntl } from "@/test/render";
import { CampaignEditor, type CampaignInitial } from "./campaign-editor";

afterEach(cleanup);

const blank: CampaignInitial = {
  listId: "l1",
  subject: "",
  preheader: "",
  locale: "vi",
  advertising: false,
  bodyText: "",
  bodyHtml: "",
};

function renderEditor(
  action = vi.fn(async (_state: FormState, _data: FormData): Promise<FormState> => ({})),
  initial = blank,
) {
  renderIntl(
    <ToastProvider>
      <CampaignEditor
        action={action}
        lists={[{ id: "l1", name: "Weekly", confirmed: 3 }]}
        initial={initial}
        submit="Save draft"
        ads={{ label: "[QC]", maxPerDay: 3 }}
        sender="Gang Shop"
        note="Saving a draft sends nothing."
        cancelHref="/marketing/newsletter"
      />
    </ToastProvider>,
  );
  return action;
}

const preview = () => screen.getByTestId("compose-preview");
const frame = () => preview().querySelector("iframe");

describe("CampaignEditor (soạn bản tin có xem trước hộp thư)", () => {
  it("xem trước cập nhật khi gõ: người gửi, tiêu đề có nhãn quảng cáo, preheader, người nhận", () => {
    renderEditor();
    const inbox = within(preview()).getByRole("region", { name: "Inbox" });
    expect(inbox.textContent).toContain("Gang Shop");
    expect(inbox.textContent).toContain("(No subject)");
    expect(
      within(preview()).getByText("Write the mail under Compose and it shows here."),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Ưu đãi" } });
    fireEvent.change(screen.getByLabelText("Preview line"), { target: { value: "Chỉ tuần này" } });
    fireEvent.click(screen.getByLabelText(/^Advertising mail/));
    expect(inbox.textContent).toContain("[QC] Ưu đãi");
    expect(inbox.textContent).toContain("Chỉ tuần này");
    expect(preview().textContent).toContain("To: Weekly");
  });

  it("bản chữ xem trong iframe sandbox, đã thoát thẻ; không có preheader thì lấy đầu thân thư", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Text version"), {
      target: { value: "Xin chào <b>bạn</b>" },
    });
    const iframe = frame();
    expect(iframe?.getAttribute("sandbox")).toBe("");
    expect(iframe?.getAttribute("srcdoc")).toContain("Xin chào &lt;b&gt;bạn&lt;/b&gt;");
    expect(within(preview()).getByRole("region", { name: "Inbox" }).textContent).toContain(
      "Xin chào <b>bạn</b>",
    );
  });

  it("tab HTML: xem bản HTML trong sandbox, đổi qua lại bản chữ; cả hai ô đều được gửi", async () => {
    const action = renderEditor();
    fireEvent.change(screen.getByLabelText("Text version"), { target: { value: "Bản chữ" } });
    fireEvent.click(screen.getByRole("tab", { name: "HTML" }));
    expect(screen.getByRole("tab", { name: "HTML" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.change(screen.getByLabelText("HTML version (optional)"), {
      target: { value: "<h1>Ưu đãi</h1><script>alert(1)</script>" },
    });
    expect(frame()?.getAttribute("sandbox")).toBe("");
    expect(frame()?.getAttribute("srcdoc")).toBe("<h1>Ưu đãi</h1><script>alert(1)</script>");

    const versions = within(preview()).getByRole("group", { name: "Version shown" });
    fireEvent.click(within(versions).getByRole("button", { name: "Text version" }));
    expect(frame()?.getAttribute("srcdoc")).toContain("Bản chữ");

    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Tin" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = action.mock.calls[0]?.[1];
    expect(data?.get("body_text")).toBe("Bản chữ");
    expect(data?.get("body_html")).toBe("<h1>Ưu đãi</h1><script>alert(1)</script>");
    expect(data?.get("list_id")).toBe("l1");
  });

  it("công tắc Máy tính / Điện thoại đổi khung xem", () => {
    renderEditor();
    expect(preview().dataset.device).toBe("desktop");
    fireEvent.click(screen.getByRole("button", { name: "Phone" }));
    expect(preview().dataset.device).toBe("phone");
    expect(screen.getByRole("button", { name: "Phone" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("lỗi ở ô của tab đang ẩn thì mở tab đó", async () => {
    renderEditor(
      vi.fn(async (): Promise<FormState> => ({ fields: { body_html: "HTML too large." } })),
    );
    expect(screen.getByRole("tab", { name: "Compose" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("HTML too large.")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /HTML/ }).getAttribute("aria-selected")).toBe("true");
  });
});
