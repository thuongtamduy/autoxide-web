import type { components } from "@autoxide/sdk";
import { describe, expect, it } from "vitest";
import { expiresAt, grantable } from "./api-keys";
import { auditFilter, auditHref, parseSubject } from "./audit";
import { formatBytes, formatMoney } from "./format";
import { endpointState, mergeDeliveries, shortUrl } from "./webhooks";

type Endpoint = components["schemas"]["EndpointResponse"];
type Delivery = components["schemas"]["DeliveryResponse"];

const endpoint = (id: string, disabled = false): Endpoint => ({
  id,
  url: `https://${id}.example.com/hook`,
  description: "",
  events: ["*"],
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  disabled_at: disabled ? "2026-11-02T00:00:00Z" : null,
});
const delivery = (id: string, at: string, status: string): Delivery => ({
  id,
  event_id: id,
  event_name: "auth.user_updated",
  status,
  attempts: 1,
  created_at: at,
});

describe("webhook", () => {
  it("trạng thái endpoint theo lần giao gần nhất", () => {
    expect(endpointState(endpoint("a", true), null)).toBe("disabled");
    expect(endpointState(endpoint("a"), delivery("1", "2026-11-03T00:00:00Z", "failed"))).toBe(
      "failing",
    );
    expect(endpointState(endpoint("a"), null)).toBe("receiving");
  });

  it("gộp lần giao của nhiều endpoint, mới nhất trước, lọc theo trạng thái", () => {
    const lists = [
      { endpoint: endpoint("a"), deliveries: [delivery("1", "2026-11-03T00:00:00Z", "succeeded")] },
      {
        endpoint: endpoint("b"),
        deliveries: [
          delivery("2", "2026-11-04T00:00:00Z", "failed"),
          delivery("3", "2026-11-01T00:00:00Z", "succeeded"),
        ],
      },
    ];
    expect(mergeDeliveries(lists).map((d) => d.id)).toEqual(["2", "1", "3"]);
    expect(mergeDeliveries(lists, { status: "succeeded", limit: 1 }).map((d) => d.id)).toEqual([
      "1",
    ]);
    expect(mergeDeliveries(lists)[0]?.endpoint.id).toBe("b");
    expect(shortUrl("https://a.example.com/x")).toBe("a.example.com/x");
  });
});

describe("API key", () => {
  it("hạn theo lựa chọn", () => {
    const now = new Date("2026-11-15T00:00:00Z");
    expect(expiresAt("30d", now)).toBe("2026-12-15T00:00:00.000Z");
    expect(expiresAt("never", now)).toBeNull();
    expect(expiresAt("lạ", now)).toBeNull();
  });

  it("chỉ chọn được permission mình có", () => {
    const catalog = [
      { name: "a.read", description: "A" },
      { name: "b.read", description: "B" },
    ];
    expect(grantable(catalog, { all_permissions: true, permissions: [] })).toHaveLength(2);
    expect(grantable(catalog, { all_permissions: false, permissions: ["b.read"] })).toEqual([
      { name: "b.read", description: "B" },
    ]);
    expect(grantable(null, { all_permissions: false, permissions: ["c.x"] })).toEqual([
      { name: "c.x", description: "" },
    ]);
  });
});

describe("bộ lọc audit", () => {
  it("bỏ giá trị rỗng và actor không phải UUID; dựng lại link", () => {
    const actor = "01936f0e-6c9f-7cc2-8a52-2b2f4d1c1e5a";
    expect(auditFilter({ module: " auth ", action: "", actor: "x" })).toEqual({ module: "auth" });
    const filter = auditFilter({ subject: "auth.user:1", actor });
    expect(filter).toEqual({ subject: "auth.user:1", actor_user_id: actor });
    expect(auditHref("/a", filter, "c1")).toBe(`/a?subject=auth.user%3A1&actor=${actor}&cursor=c1`);
    expect(auditHref("/a", {})).toBe("/a");
  });

  it("tách bản ghi thành loại và id", () => {
    expect(parseSubject("auth.user:0190")).toEqual({ kind: "auth.user", id: "0190" });
    expect(parseSubject("nope")).toBeNull();
    expect(parseSubject(null)).toBeNull();
  });
});

describe("định dạng", () => {
  it("tiền theo đơn vị nhỏ nhất của tiền tệ", () => {
    // Intl đặt khoảng trắng không ngắt dòng trước ký hiệu tiền.
    expect(formatMoney(118_800_000, "VND", "vi")).toBe("118.800.000\u00a0₫");
    expect(formatMoney(1050, "USD", "en")).toBe("$10.50");
  });

  it("dung lượng theo đơn vị nghìn", () => {
    expect(formatBytes(38_200_000_000, "en")).toBe("38.2 GB");
    expect(formatBytes(512, "en")).toBe("512 B");
  });
});
