import { PRIVACY_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { getRetention, listPurposes } from "@/sample/compliance-records";
import { RULESET } from "@/sample/compliance-rules";

// Tải sổ hoạt động xử lý (mục đích, căn cứ, loại dữ liệu, thời hạn, nơi lưu) — dữ liệu mẫu (W-012).
// Thay bằng GET /api/v1/compliance/processing-register (bước 37) khi core có: route này khi đó gọi
// core bằng token trong cookie rồi trả nguyên tệp.
export async function GET(): Promise<Response> {
  if (!sampleDataEnabled()) return new Response(null, { status: 404 });
  if (!(await can(PRIVACY_READ))) return new Response(null, { status: 403 });
  const [{ data: purposes }, { data: retention }] = await Promise.all([
    listPurposes(),
    getRetention(),
  ]);
  const register = {
    sample: true,
    ruleset: `${RULESET.jurisdiction} ${RULESET.release}`,
    generated_at: new Date().toISOString(),
    residency: retention.residency,
    purposes: purposes.filter((p) => p.active),
    retention: retention.items,
    disclaimer:
      "Input for the data protection impact assessment. The assessment template needs review by a person with legal expertise.",
  };
  return new Response(JSON.stringify(register, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="processing-register.json"',
    },
  });
}
