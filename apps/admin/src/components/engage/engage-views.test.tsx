// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { ChangeState } from "@/lib/engage";
import { emptyField } from "@/lib/forms";
import { renderIntl } from "@/test/render";
import { ChangeButtons } from "./actions";
import { FormEditor } from "./form-editor";
import { FormPreview } from "./form-preview";

afterEach(cleanup);

describe("ChangeButtons (đổi trạng thái có Hoàn tác)", () => {
  it("báo xong kèm Hoàn tác; Hoàn tác gửi lại trạng thái cũ với phiên bản mới", async () => {
    const calls: Record<string, string>[] = [];
    const action = vi.fn(async (_state: ChangeState, data: FormData): Promise<ChangeState> => {
      calls.push(Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)])));
      return calls.length === 1
        ? { done: 1, previous: "pending", updated: "2026-11-15T01:00:00Z" }
        : { done: 1, previous: "published", updated: "2026-11-15T01:00:01Z" };
    });
    renderIntl(
      <ToastProvider>
        <ChangeButtons
          action={action}
          id="c1"
          expect="2026-11-15T00:00:00Z"
          undo={{ label: "Undo", done: "Undone." }}
          moves={[{ value: "published", label: "Approve", done: "Approved." }]}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Approved.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Undone.")).toBeTruthy();
    expect(calls).toEqual([
      { id: "c1", expect: "2026-11-15T00:00:00Z", status: "published" },
      { id: "c1", expect: "2026-11-15T01:00:00Z", status: "pending" },
    ]);
  });

  it("lỗi của core hiện ngay dưới nút, không báo xong", async () => {
    const action = vi.fn(
      async (): Promise<ChangeState> => ({
        error: "Someone changed this record.",
        code: "precondition_failed",
      }),
    );
    renderIntl(
      <ToastProvider>
        <ChangeButtons
          action={action}
          id="c1"
          expect="v1"
          undo={{ label: "Undo", done: "Undone." }}
          moves={[{ value: "spam", label: "Spam", done: "Marked." }]}
        />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Spam" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Someone changed this record.");
    expect(screen.queryByText("Marked.")).toBeNull();
  });
});

describe("FormEditor (trình sửa biểu mẫu)", () => {
  const initial = {
    name: "",
    key: "",
    status: "open" as const,
    retentionDays: "",
    successVi: "",
    successEn: "",
    notifyEmails: "",
    replyTo: "",
    origins: "",
    ipLimit: "",
    emailLimit: "",
    fields: [{ ...emptyField("text"), key: "name", labelVi: "Họ tên" }],
  };

  it("gợi ý mã từ tên; thêm, đổi chỗ trường; gửi danh sách trường dạng JSON", async () => {
    let sent: FormData | null = null;
    const action = vi.fn(async (_s: unknown, data: FormData) => {
      sent = data;
      return {};
    });
    renderIntl(
      <ToastProvider>
        <FormEditor action={action} initial={initial} submit="Create form" />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Đặt lịch học" } });
    expect((screen.getByLabelText("Form key") as HTMLInputElement).value).toBe("dat-lich-hoc");
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    const types = screen.getByRole("group", { name: "New field type" });
    fireEvent.click(within(types).getByRole("button", { name: "Email" }));
    // Thẻ mới mở sẵn, con trỏ ở ô nhãn; bảng loại trường đóng lại.
    expect(screen.queryByRole("group", { name: "New field type" })).toBeNull();
    const added = screen.getByRole("listitem", { name: /Field 2/ });
    expect(document.activeElement).toBe(within(added).getByLabelText("Label (Vietnamese)"));
    fireEvent.click(screen.getByRole("button", { name: "Move field 2 up" }));
    fireEvent.click(screen.getByRole("button", { name: "Create form" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const fields = JSON.parse(String((sent as FormData | null)?.get("fields")));
    expect(fields.map((f: { type: string }) => f.type)).toEqual(["email", "text"]);
  });

  it("lỗi của core theo đường dẫn hiện dưới đúng thẻ", async () => {
    const action = vi.fn(async () => ({
      fields: { "fields[0].key": "is already used by another field" },
    }));
    renderIntl(
      <ToastProvider>
        <FormEditor action={action} initial={initial} submit="Save form" />
      </ToastProvider>,
    );
    // Đợi Server Action (giả) trả về và React vẽ xong lỗi, thay vì đoán thời gian chờ.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save form" }));
    });
    await waitFor(() =>
      expect(screen.getByRole("listitem", { name: /Field 1/ }).textContent).toContain(
        "is already used by another field",
      ),
    );
    // Thẻ có lỗi tự mở và con trỏ tới đúng ô sai.
    const card = screen.getByRole("listitem", { name: /Field 1/ });
    expect(document.activeElement).toBe(within(card).getByLabelText("Field key"));
    expect(within(card).getByRole("button", { expanded: true })).toBeTruthy();
  });

  it("thẻ trường gập sẵn: đầu thẻ có nhãn, loại, bắt buộc; bấm mới mở chi tiết", () => {
    renderIntl(
      <ToastProvider>
        <FormEditor
          action={vi.fn(async () => ({}))}
          initial={{
            ...initial,
            fields: [{ ...emptyField("email"), key: "email", labelVi: "Email", required: true }],
          }}
          submit="Create form"
        />
      </ToastProvider>,
    );
    const card = screen.getByRole("listitem", { name: /Field 1/ });
    const toggle = within(card).getByRole("button", { expanded: false });
    expect(toggle.textContent).toContain("Email");
    expect(toggle.textContent).toContain("Required");
    expect(within(card).queryByLabelText("Field key")).toBeNull();
    fireEvent.click(toggle);
    expect((within(card).getByLabelText("Field key") as HTMLInputElement).value).toBe("email");
    fireEvent.click(toggle);
    expect(within(card).queryByLabelText("Field key")).toBeNull();
  });

  it("kéo thả đổi chỗ thẻ trường", async () => {
    let sent: FormData | null = null;
    const action = vi.fn(async (_s: unknown, data: FormData) => {
      sent = data;
      return {};
    });
    renderIntl(
      <ToastProvider>
        <FormEditor
          action={action}
          initial={{
            ...initial,
            name: "A",
            key: "a",
            fields: [
              { ...emptyField("text"), key: "a" },
              { ...emptyField("text"), key: "b" },
              { ...emptyField("text"), key: "c" },
            ],
          }}
          submit="Create form"
        />
      </ToastProvider>,
    );
    const first = screen.getByRole("listitem", { name: /Field 1/ });
    const third = screen.getByRole("listitem", { name: /Field 3/ });
    const grip = first.querySelector(".fb-grip");
    if (!grip) throw new Error("thiếu tay nắm");
    fireEvent.dragStart(grip);
    fireEvent.dragOver(third);
    fireEvent.drop(third);
    fireEvent.click(screen.getByRole("button", { name: "Create form" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const fields = JSON.parse(String((sent as FormData | null)?.get("fields")));
    expect(fields.map((f: { key: string }) => f.key)).toEqual(["b", "c", "a"]);
  });

  it("cài đặt ở tab riêng vẫn gửi đi; lỗi ở cài đặt mở tab Cài đặt", async () => {
    let sent: FormData | null = null;
    const action = vi.fn(async (_s: unknown, data: FormData) => {
      sent = data;
      return { fields: { notify_emails: "is not a valid email address" } };
    });
    renderIntl(
      <ToastProvider>
        <FormEditor
          action={action}
          initial={{ ...initial, notifyEmails: "x", ipLimit: "5" }}
          submit="Create form"
        />
      </ToastProvider>,
    );
    const settings = screen.getByRole("tab", { name: "Settings" });
    expect(settings.getAttribute("aria-selected")).toBe("false");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create form" }));
    });
    const data = sent as FormData | null;
    expect(data?.get("notify_emails")).toBe("x");
    expect(data?.get("ip_limit_per_hour")).toBe("5");
    expect(data?.get("status")).toBe("open");
    await waitFor(() => expect(settings.getAttribute("aria-selected")).toBe("true"));
    expect(settings.textContent).toContain("1");
    expect(document.activeElement).toBe(screen.getByLabelText("Mail each new submission to"));
  });
});

describe("FormPreview (xem trước biểu mẫu)", () => {
  const fields = [
    {
      ...emptyField("text"),
      key: "name",
      labelVi: "Họ tên",
      labelEn: "Name",
      required: true,
      placeholderEn: "Your name",
    },
    { ...emptyField("radio"), key: "size", labelVi: "Cỡ", options: "s | Nhỏ | Small\nl | Lớn" },
    { ...emptyField("consent"), key: "ok", labelEn: "I agree" },
    { ...emptyField("hidden"), key: "source" },
  ];

  it("vẽ trường theo ngôn ngữ xem trước, thiếu thì lấy ngôn ngữ kia; ô khoá, không có name", () => {
    const { container } = renderIntl(
      <FormPreview name="Liên hệ" fields={fields} lang="en" success="Thanks!" closed={false} />,
    );
    const sheet = container.querySelector(".fb-sheet");
    expect(sheet?.getAttribute("aria-hidden")).toBe("true");
    const text = sheet?.textContent ?? "";
    expect(text).toContain("Liên hệ");
    expect(text).toContain("Name*");
    expect(text).toContain("Cỡ");
    expect(text).toContain("Small");
    expect(text).toContain("Lớn");
    expect(text).toContain("I agree");
    expect(text).toContain("source");
    expect(text).toContain("After sending: Thanks!");
    const inputs = [...(sheet?.querySelectorAll("input, select, textarea") ?? [])];
    expect(inputs.length).toBe(4);
    expect(inputs.every((input) => (input as HTMLInputElement).disabled)).toBe(true);
    expect(inputs.some((input) => input.hasAttribute("name"))).toBe(false);
    expect((inputs[0] as HTMLInputElement).placeholder).toBe("Your name");
  });

  it("tiếng Việt; form đóng; chưa có trường", () => {
    const { container } = renderIntl(
      <FormPreview name="" fields={[]} lang="vi" success="" closed />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Untitled form");
    expect(text).toContain("This form is closed");
    expect(text).toContain("Add fields to see the form here.");
    expect(container.querySelector("button")).toBeNull();
  });
});
