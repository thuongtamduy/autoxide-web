import { describe, expect, it } from "vitest";
import { ceremonyErrorKey, creationOptionsJson, requestOptionsJson } from "./webauthn";

describe("creationOptionsJson", () => {
  const inner = { challenge: "c", rp: { id: "localhost", name: "x" } };

  it("nhận options trần và options bọc trong publicKey", () => {
    expect(creationOptionsJson(inner)).toBe(inner);
    expect(creationOptionsJson({ publicKey: inner })).toBe(inner);
  });
});

describe("requestOptionsJson", () => {
  const inner = { challenge: "c", rpId: "localhost" };

  it("nhận options trần và options bọc trong publicKey", () => {
    expect(requestOptionsJson(inner)).toBe(inner);
    expect(requestOptionsJson({ publicKey: inner })).toBe(inner);
  });
});

describe("ceremonyErrorKey", () => {
  it("huỷ, trùng, lỗi khác", () => {
    expect(ceremonyErrorKey(new DOMException("x", "NotAllowedError"))).toBe("cancelled");
    expect(ceremonyErrorKey(new DOMException("x", "AbortError"))).toBe("cancelled");
    expect(ceremonyErrorKey(new DOMException("x", "InvalidStateError"))).toBe("exists");
    expect(ceremonyErrorKey(new Error("boom"))).toBe("failed");
    expect(ceremonyErrorKey("weird")).toBe("failed");
  });
});
