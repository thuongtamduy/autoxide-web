import { beforeEach, describe, expect, it, vi } from "vitest";

// Thao tác hàng loạt của các màn dùng core thật (W-058): core chưa có endpoint hàng loạt, nên mỗi
// Server Action lặp lệnh từng cái và gom lỗi theo dòng bằng câu của core. Thay `send` bằng core giả
// nhỏ: ghi lại từng lời gọi, id nào nằm trong `refuse` thì trả Problem.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/org-server", () => ({ rootUnit: async () => null }));
const core = vi.hoisted(() => ({
  calls: [] as { method: string; path: string; id: string; body: unknown }[],
  refuse: new Map<string, string>(),
}));
vi.mock("@/lib/action", () => ({
  send: async (
    call: (client: unknown) => Promise<{ data?: unknown; response: Response }>,
  ): Promise<unknown> => {
    let id = "";
    const record =
      (method: string) =>
      async (path: string, init: { params: { path: { id: string } }; body?: unknown }) => {
        id = init.params.path.id;
        core.calls.push({ method, path, id, body: init.body });
        return { data: { data: { updated_at: "2026-11-17T00:00:00Z" } } };
      };
    const client = { PATCH: record("PATCH"), POST: record("POST"), DELETE: record("DELETE") };
    const answer = await call(client);
    const detail = core.refuse.get(id);
    if (detail) {
      return {
        ok: false,
        problem: { type: "about:blank", title: "x", status: 409, code: "refused", detail },
      };
    }
    return { ok: true, data: answer.data };
  },
}));

const { bulkLockBuyers, bulkUnlockBuyers, changeBuyer } = await import(
  "@/app/(admin)/customers/account-actions"
);
const { bulkDisableUsers, bulkDeleteRoles, changeUser } = await import(
  "@/app/(admin)/org/access/actions"
);
const { bulkResendInvites, bulkRevokeInvites, bulkRevokeDelegations } = await import(
  "@/app/(admin)/org/access/team-actions"
);
const { bulkDisableWebhooks, bulkRevokeAnyApiKeys, changeWebhook } = await import(
  "@/app/(admin)/settings/actions"
);

beforeEach(() => {
  core.calls = [];
  core.refuse = new Map();
});

describe("hàng loạt trên core thật: lặp lệnh từng cái, gom lỗi", () => {
  it("khoá người mua: một PATCH cho mỗi id (bỏ trùng, bỏ rỗng), lỗi giữ câu của core", async () => {
    core.refuse.set("b2", "This account is already locked.");
    const result = await bulkLockBuyers({ ids: ["b1", "b2", "b1", " "] });
    expect(core.calls).toEqual([
      { method: "PATCH", path: "/api/v1/auth/customers/{id}", id: "b1", body: { disabled: true } },
      { method: "PATCH", path: "/api/v1/auth/customers/{id}", id: "b2", body: { disabled: true } },
    ]);
    expect(result).toEqual({
      total: 2,
      done: 1,
      errors: [{ id: "b2", name: "b2", detail: "This account is already locked." }],
    });
    await bulkUnlockBuyers({ ids: ["b3"] });
    expect(core.calls.at(-1)?.body).toEqual({ disabled: false });
  });

  it("người dùng, role, lời mời, uỷ quyền, webhook, API key: đúng endpoint từng cái", async () => {
    await bulkDisableUsers({ ids: ["u1"] });
    await bulkDeleteRoles({ ids: ["r1"] });
    await bulkResendInvites({ ids: ["i1"] });
    await bulkRevokeInvites({ ids: ["i2"] });
    await bulkRevokeDelegations({ ids: ["d1"] });
    await bulkDisableWebhooks({ ids: ["w1"] });
    await bulkRevokeAnyApiKeys({ ids: ["k1"] });
    expect(core.calls.map((c) => `${c.method} ${c.path} ${c.id}`)).toEqual([
      "PATCH /api/v1/auth/users/{id} u1",
      "DELETE /api/v1/auth/roles/{id} r1",
      "POST /api/v1/auth/invitations/{id}/resend i1",
      "DELETE /api/v1/auth/invitations/{id} i2",
      "DELETE /api/v1/auth/delegations/{id} d1",
      "PATCH /api/v1/webhooks/{id} w1",
      "DELETE /api/v1/auth/all-api-keys/{id} k1",
    ]);
  });
});

describe("đổi trạng thái đảo được của menu ⋯", () => {
  const form = (id: string, status: string) => {
    const data = new FormData();
    data.set("id", id);
    data.set("status", status);
    return data;
  };

  it("trả trạng thái cũ để Hoàn tác gửi lại", async () => {
    expect(await changeBuyer({}, form("b1", "active"))).toEqual({
      done: 1,
      previous: "disabled",
      updated: "2026-11-17T00:00:00Z",
    });
    expect((await changeUser({}, form("u1", "disabled"))).previous).toBe("active");
    expect((await changeWebhook({}, form("w1", "active"))).previous).toBe("disabled");
    expect(core.calls.map((c) => c.body)).toEqual([
      { disabled: false },
      { disabled: true },
      { disabled: false },
    ]);
  });

  it("core từ chối: báo lỗi, không có Hoàn tác", async () => {
    core.refuse.set("u9", "You cannot disable your own account.");
    const state = await changeUser({}, form("u9", "disabled"));
    expect(state.done).toBeUndefined();
    expect(state.error).toBe("You cannot disable your own account.");
  });
});
