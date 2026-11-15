// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PermissionPicker } from "@/components/access/permission-picker";
import { SecretOnce } from "@/components/ui/secret-once";
import { renderIntl } from "@/test/render";

afterEach(cleanup);

describe("SecretOnce", () => {
  it("hiện secret một lần kèm lời dặn, chép được", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderIntl(<SecretOnce value="axk_123" label="API key" note="Shown only once." />);
    expect(screen.getByTestId("secret").textContent).toBe("axk_123");
    expect(screen.getByText("Shown only once.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("axk_123");
    expect(await screen.findByText("Copied.")).toBeTruthy();
  });

  it("không chép được thì nói rõ", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error()) } });
    renderIntl(<SecretOnce value="x" label="Key" note="n" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText(/Could not copy/)).toBeTruthy();
  });
});

function Picker() {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  return (
    <form>
      <PermissionPicker
        catalog={[
          { name: "auth.users.read", description: "See accounts" },
          { name: "webhooks.manage", description: "Manage webhooks" },
        ]}
        chosen={chosen}
        onChange={setChosen}
        editable
      />
    </form>
  );
}

describe("PermissionPicker (dùng chung cho role và API key)", () => {
  it("chọn theo nhóm, tìm không dấu vẫn giữ lựa chọn", () => {
    renderIntl(<Picker />);
    fireEvent.click(screen.getByLabelText(/auth\.users\.read/));
    expect(screen.getByTestId("chosen-count").textContent).toBe("1 of 2 chosen");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "webhook" } });
    expect(screen.getByLabelText(/auth\.users\.read/).closest("label")?.hidden).toBe(true);
    expect(screen.getByTestId("chosen-count").textContent).toBe("1 of 2 chosen");
    fireEvent.click(screen.getByRole("button", { name: "Choose all of webhooks" }));
    expect(screen.getByTestId("chosen-count").textContent).toBe("2 of 2 chosen");
  });
});
