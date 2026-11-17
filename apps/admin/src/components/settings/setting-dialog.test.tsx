// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { FormState } from "@/lib/form";
import { renderIntl } from "@/test/render";
import { type SettingDialogField, SettingForm } from "./setting-dialog";

afterEach(cleanup);

const FIELDS: SettingDialogField[] = [
  {
    name: "mail.connection.smtp.url",
    secret: true,
    is_set: true,
    value: null,
    label: "SMTP server address",
  },
  {
    name: "mail.connection.smtp.from",
    secret: false,
    is_set: true,
    value: "Shop <a@example.com>",
    label: "Sender",
  },
];

function setup(
  save: (state: FormState, data: FormData) => Promise<FormState>,
  remove: (state: FormState, data: FormData) => Promise<FormState> = async () => ({ done: 1 }),
  fields: SettingDialogField[] = FIELDS,
) {
  const close = vi.fn();
  renderIntl(
    <ToastProvider>
      <SettingForm
        name="Your own mail server"
        fields={fields}
        removeLabel="Disconnect"
        save={save}
        remove={remove}
        close={close}
      />
    </ToastProvider>,
  );
  return close;
}

const click = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });

describe("SettingForm (hộp thoại kết nối đối tác)", () => {
  it("nhãn dễ hiểu, khoá kỹ thuật chỉ là chữ phụ; secret không bao giờ điền lại", () => {
    setup(vi.fn());
    const secret = screen.getByLabelText("SMTP server address") as HTMLInputElement;
    expect(secret.type).toBe("password");
    expect(secret.value).toBe("");
    expect(screen.getByText("Set. Leave empty to keep the current value.")).toBeTruthy();
    expect((screen.getByLabelText("Sender") as HTMLInputElement).value).toBe(
      "Shop <a@example.com>",
    );
    expect(screen.getByText("mail.connection.smtp.url").className).toContain("conn-key");
  });

  it("chỉ gửi ô đã đổi, mỗi cài đặt một lệnh của Server Action cũ", async () => {
    const calls: FormData[] = [];
    const save = vi.fn(async (_s: FormState, data: FormData) => {
      calls.push(data);
      return { done: 1 };
    });
    const close = setup(save);
    fireEvent.change(screen.getByLabelText("SMTP server address"), {
      target: { value: "smtps://u:p@smtp.example.com" },
    });
    await click("Save");
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.get("name")).toBe("mail.connection.smtp.url");
    expect(calls[0]?.get("secret")).toBe("1");
    expect(calls[0]?.get("value")).toBe("smtps://u:p@smtp.example.com");
    expect(screen.getByRole("status").textContent).toContain("Saved Your own mail server.");
  });

  it("lỗi của core hiện dưới đúng ô", async () => {
    const save = vi.fn(async () => ({ fields: { value: "must look like a sender" } }));
    const close = setup(save);
    fireEvent.change(screen.getByLabelText("Sender"), { target: { value: "nope" } });
    await click("Save");
    await waitFor(() =>
      expect(screen.getByLabelText("Sender").getAttribute("aria-invalid")).toBe("true"),
    );
    expect(screen.getByText("must look like a sender")).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
  });

  it("chưa đặt gì mà bấm Lưu trống thì báo ở ô đầu", async () => {
    const save = vi.fn();
    setup(
      save,
      undefined,
      FIELDS.map((f) => ({ ...f, is_set: false, value: null })),
    );
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
    await click("Save");
    await waitFor(() => expect(screen.getByText("Enter a value.")).toBeTruthy());
    expect(save).not.toHaveBeenCalled();
  });

  it("ngắt kết nối hỏi lại rồi gỡ từng cài đặt đã đặt", async () => {
    const removed: string[] = [];
    const remove = vi.fn(async (_s: FormState, data: FormData) => {
      removed.push(String(data.get("id")));
      return { done: 1 };
    });
    const close = setup(vi.fn(), remove);
    await click("Disconnect");
    expect(screen.getByTestId("conn-remove").textContent).toContain("cannot be recovered");
    await click("Disconnect");
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(removed).toEqual(["mail.connection.smtp.url", "mail.connection.smtp.from"]);
  });
});
