// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { ChangeState } from "@/lib/engage";
import { emptyField } from "@/lib/forms";
import { renderIntl } from "@/test/render";
import { ChangeButtons } from "./actions";
import { FormEditor } from "./form-editor";

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
    fireEvent.change(screen.getByLabelText("New field type"), { target: { value: "email" } });
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
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
  });
});
