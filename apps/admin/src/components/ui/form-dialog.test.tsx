// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderIntl } from "@/test/render";
import { type DialogState, InlineForm } from "./form-dialog";
import { ToastProvider } from "./toast";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

describe("InlineForm", () => {
  it("gom lỗi một lần, lỗi dưới đúng ô (aria-invalid), giữ ô ẩn; xong thì báo", async () => {
    const calls: FormData[] = [];
    const action = vi.fn(async (_state: DialogState, data: FormData): Promise<DialogState> => {
      calls.push(data);
      return calls.length === 1
        ? { fields: { name: "Fill in this field.", agree: "Tick this box to confirm." } }
        : { done: 1 };
    });
    renderIntl(
      <ToastProvider>
        <InlineForm
          action={action}
          submit="Save"
          done="Saved."
          fields={[
            { kind: "hidden", name: "id", value: "u1" },
            { kind: "text", name: "name", label: "Name" },
            { kind: "check", name: "agree", label: "I agree" },
          ]}
        />
      </ToastProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("2 fields need fixing."),
    );
    expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Fill in this field.")).toBeTruthy();
    expect(screen.getByText("Tick this box to confirm.")).toBeTruthy();
    expect(calls[0]?.get("id")).toBe("u1");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Kho mới" } });
    fireEvent.click(screen.getByLabelText("I agree"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Saved."));
    expect(calls[1]?.get("agree")).toBe("on");
  });
});
