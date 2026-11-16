import { sellerContext } from "@/lib/seller";
import { statementCsv } from "@/sample/market";

// Sao kê CSV của người bán đang xem (dữ liệu mẫu, W-018). Khi core có API thì route gọi
// `GET /api/v1/marketplace/statements` bằng token trong cookie rồi trả nguyên tệp core sinh.
export async function GET(): Promise<Response> {
  const ctx = await sellerContext();
  if (!ctx) return new Response("Forbidden", { status: 403 });
  const csv = await statementCsv(ctx.seller.org_id);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${ctx.seller.slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
