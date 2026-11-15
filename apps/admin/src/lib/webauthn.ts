// Phần thuần của việc thêm passkey ở trình duyệt (không chạm token).

/**
 * Options của core cho `PublicKeyCredential.parseCreationOptionsFromJSON()`. Một số thư viện
 * phía máy chủ bọc options trong `publicKey` (như tham số của `navigator.credentials.create`);
 * nhận cả hai dạng.
 */
export function creationOptionsJson(options: unknown): PublicKeyCredentialCreationOptionsJSON {
  if (typeof options === "object" && options !== null && "publicKey" in options) {
    return (options as { publicKey: PublicKeyCredentialCreationOptionsJSON }).publicKey;
  }
  return options as PublicKeyCredentialCreationOptionsJSON;
}

/** Trình duyệt có đủ API để thêm passkey từ options dạng JSON. */
export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential?.parseCreationOptionsFromJSON === "function" &&
    typeof navigator.credentials?.create === "function"
  );
}

/** Lỗi của `navigator.credentials.create()` → khoá câu báo trong `messages` (`account.passkeys.*`). */
export function ceremonyErrorKey(error: unknown): "cancelled" | "exists" | "failed" {
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "cancelled";
  if (name === "InvalidStateError") return "exists";
  return "failed";
}
