import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import vi from "../../messages/vi.json";
import {
  connectionCategory,
  connectionKind,
  connectionStatus,
  groupConnections,
  planChanges,
  settingMessageKey,
  splitSettings,
} from "./tenant-settings";

describe("splitSettings", () => {
  it("tách kết nối đối tác khỏi cấu hình nghiệp vụ, giữ thứ tự", () => {
    const all = [
      { name: "ai.connection.text.api_key", group: "connection" },
      { name: "comments.max_links", group: null },
      { name: "mail.connection.smtp.url", group: "connection" },
      { name: "kernel.public_url" },
    ];
    const { connection, business } = splitSettings(all);
    expect(connection.map((s) => s.name)).toEqual([
      "ai.connection.text.api_key",
      "mail.connection.smtp.url",
    ]);
    expect(business.map((s) => s.name)).toEqual(["comments.max_links", "kernel.public_url"]);
  });

  it("core cũ không có group: mọi thứ là cấu hình nghiệp vụ", () => {
    const old: { name: string; group?: string | null }[] = [{ name: "mail.smtp_url" }];
    expect(splitSettings(old).connection).toEqual([]);
  });
});

describe("connectionKind", () => {
  it("đọc module và loại từ tên", () => {
    expect(connectionKind("mail.connection.smtp.url")).toBe("mail.smtp");
    expect(connectionKind("ai.connection.text.api_key")).toBe("ai.text");
  });

  it("tên không đúng dạng thì null", () => {
    expect(connectionKind("comments.max_links")).toBeNull();
    expect(connectionKind("mail.connection.smtp")).toBeNull();
  });
});

describe("connectionCategory", () => {
  it("xếp module vào loại đối tác; module lạ vào nhóm khác", () => {
    expect(connectionCategory("mail")).toBe("email");
    expect(connectionCategory("sms")).toBe("messaging");
    expect(connectionCategory("zalo")).toBe("messaging");
    expect(connectionCategory("payments")).toBe("payment");
    expect(connectionCategory("invoices")).toBe("einvoice");
    expect(connectionCategory("shipping")).toBe("shipping");
    expect(connectionCategory("ai")).toBe("ai");
    expect(connectionCategory("crm")).toBe("other");
    expect(connectionCategory("toString")).toBe("other");
  });
});

describe("groupConnections", () => {
  it("gom theo <module>.<loại>, giữ thứ tự xuất hiện", () => {
    const groups = groupConnections([
      { name: "mail.connection.smtp.url" },
      { name: "ai.connection.text.api_key" },
      { name: "mail.connection.smtp.from" },
      { name: "ai.connection.text.model" },
      { name: "odd" },
    ]);
    expect(groups.map((g) => [g.kind, g.module, g.category, g.settings.length])).toEqual([
      ["mail.smtp", "mail", "email", 2],
      ["ai.text", "ai", "ai", 2],
      ["odd", "odd", "other", 1],
    ]);
  });
});

describe("settingMessageKey", () => {
  it("bỏ chữ connection trong tên kết nối, giữ nguyên cài đặt nghiệp vụ", () => {
    expect(settingMessageKey("mail.connection.smtp.url")).toBe("mail.smtp.url");
    expect(settingMessageKey("comments.max_links")).toBe("comments.max_links");
  });
});

describe("connectionStatus", () => {
  it("lỗi kiểm tra trước, rồi có đặt riêng hay không", () => {
    expect(connectionStatus([{ is_set: false }, { is_set: true }])).toBe("connected");
    expect(connectionStatus([{ is_set: false }])).toBe("unset");
    expect(connectionStatus([{ is_set: true }], { ok: false })).toBe("error");
    expect(connectionStatus([{ is_set: true }], { ok: true })).toBe("connected");
  });
});

describe("planChanges", () => {
  const fields = [
    { name: "mail.connection.smtp.url", secret: true, is_set: true, value: null },
    { name: "mail.connection.smtp.from", secret: false, is_set: true, value: "Shop <a@b.c>" },
    { name: "x.connection.y.z", secret: false, is_set: false, value: null },
  ];
  const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";

  it("secret để trống là giữ; ô thường không đổi thì không gửi", () => {
    expect(planChanges(fields, form({ "mail.connection.smtp.from": "Shop <a@b.c>" }))).toEqual([]);
  });

  it("secret nhập thì thay (giữ nguyên chữ); ô thường đổi thì đặt (bỏ khoảng trắng)", () => {
    expect(
      planChanges(
        fields,
        form({
          "mail.connection.smtp.url": " smtp://u:p@h ",
          "mail.connection.smtp.from": "Shop <a@b.c>",
          "x.connection.y.z": " v ",
        }),
      ),
    ).toEqual([
      { name: "mail.connection.smtp.url", secret: true, op: "set", value: " smtp://u:p@h " },
      { name: "x.connection.y.z", secret: false, op: "set", value: "v" },
    ]);
  });

  it("xoá trắng ô thường đã đặt là gỡ", () => {
    expect(planChanges(fields, form({}))).toEqual([
      { name: "mail.connection.smtp.from", secret: false, op: "remove" },
    ]);
  });
});

// Mọi cài đặt theo khách mà core khai hôm nay (và kết nối mẫu) có tên dễ hiểu ở cả hai ngôn ngữ:
// màn không lộ khoá kỹ thuật hay mô tả tiếng Anh của core.
describe("chữ của màn Kết nối đối tác", () => {
  const connections = [
    "mail.connection.smtp.url",
    "mail.connection.smtp.from",
    "ai.connection.text.api_key",
    "ai.connection.text.model",
    "sms.connection.gateway.provider",
    "sms.connection.gateway.brandname",
    "sms.connection.gateway.api_key",
    "payments.connection.gateway.provider",
    "payments.connection.gateway.merchant_id",
    "payments.connection.gateway.secret_key",
    "invoices.connection.einvoice.provider",
    "invoices.connection.einvoice.username",
    "invoices.connection.einvoice.certificate",
  ];
  const business = [
    "kernel.public_url",
    "comments.banned_words",
    "comments.suspect_words",
    "comments.max_links",
    "comments.guest_moderation",
    "comments.user_moderation",
    "content.locales",
    "content.default_locale",
    "forms.retention_days",
    "media.alt_locales",
  ];

  it.each([
    ["en", en],
    ["vi", vi],
  ])("%s: có tên, mô tả cho mọi kết nối và cài đặt", (locale, messages) => {
    // Khoá dựng từ tên cài đặt (chuỗi bất kỳ), như ở trang: đọc thẳng cây messages.
    const text = (key: string): unknown =>
      `settings.connections.${key}`
        .split(".")
        .reduce<unknown>(
          (node, part) =>
            node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
          messages,
        );
    const t = Object.assign((key: string) => String(text(key)), {
      has: (key: string) => typeof text(key) === "string",
    });
    for (const group of groupConnections(connections.map((name) => ({ name })))) {
      expect(t.has(`kinds.${group.kind}.name`), group.kind).toBe(true);
      expect(t.has(`kinds.${group.kind}.about`), group.kind).toBe(true);
      expect(t.has(`categories.${group.category}.title`), group.category).toBe(true);
    }
    for (const name of connections) {
      expect(t.has(`fields.${settingMessageKey(name)}.label`), name).toBe(true);
    }
    for (const name of business) {
      expect(t.has(`settings.${name}.label`), name).toBe(true);
      expect(t(`settings.${name}.about`)).not.toMatch(/AUTOXIDE_/);
      expect(t.has(`business.modules.${name.split(".")[0]}`), name).toBe(true);
    }
    expect(t("ai.about")).not.toMatch(/AUTOXIDE_/);
    // `<…>` trong câu ICU là thẻ: phải thoát bằng dấu nháy, hiện ra vẫn là `<…>`.
    const intl = createTranslator({ locale, messages });
    expect(intl("settings.connections.fields.mail.smtp.from.hint")).toContain(
      "<no-reply@example.com>",
    );
  });
});
