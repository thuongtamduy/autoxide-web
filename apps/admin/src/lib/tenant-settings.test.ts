import { describe, expect, it } from "vitest";
import { connectionKind, splitSettings } from "./tenant-settings";

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
