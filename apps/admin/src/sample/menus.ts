// Dữ liệu mẫu của màn Menu (W-006). Module `menus` đã có trong core (v0.14.0, D-238): danh sách,
// đọc, tạo, lưu, xoá menu và menu công khai đều gọi API thật. Phần còn mẫu là **sổ đối tượng** của
// các loại thương mại mà core chưa đăng ký (danh mục sản phẩm bước 41, khuyến mại 43, gian hàng 46,
// cửa hàng công khai 34): để thấy trình sửa theo bản thiết kế. Mục trỏ tới đối tượng mẫu thì core từ
// chối khi lưu (`menus.ref_unknown_kind`), giao diện hiện đúng lỗi đó, không giả lưu được.
import type { RefKind, RefObject } from "@/lib/menus";

/** Loại thương mại chưa có trong core, kèm bước sẽ đăng ký nó (D-238, quyết định 5). */
export const SAMPLE_REF_KINDS: readonly RefKind[] = [
  { kind: "catalog.category", tree: true, step: "41" },
  { kind: "promotions.promotion", tree: false, step: "43" },
  { kind: "marketplace.seller", tree: false, step: "46" },
  { kind: "organizations.store", tree: false, step: "34" },
];

let seq = 0;
/** Id giống UUIDv7 cho dữ liệu mẫu (ổn định trong một lần chạy). */
function sid(): string {
  seq += 1;
  return `01a1e000-0b1e-7000-8000-${seq.toString(16).padStart(12, "0")}`;
}

function obj(
  kind: string,
  title: string,
  hint: string,
  pub: boolean,
  children: string[] = [],
): RefObject {
  return { kind, id: sid(), title, hint, public: pub, children, sample: true };
}

const C = "catalog.category";
const P = "promotions.promotion";
const SL = "marketplace.seller";
const ST = "organizations.store";

function seed(): RefObject[] {
  seq = 0;
  return [
    obj(C, "Tất cả sản phẩm", "/danh-muc", true, [
      "Dụng cụ nấu",
      "Dao và thớt",
      "Đồ chứa, bảo quản",
      "Gốm sứ",
      "Khăn, phụ kiện",
    ]),
    obj(C, "Dụng cụ nấu", "/danh-muc/dung-cu-nau", true, [
      "Chảo",
      "Nồi",
      "Xửng hấp",
      "Dụng cụ nướng",
      "Muôi và xẻng",
    ]),
    obj(C, "Dao và thớt", "/danh-muc/dao-va-thot", true, [
      "Dao bếp",
      "Bộ dao",
      "Thớt gỗ",
      "Mài dao",
    ]),
    obj(C, "Gốm sứ", "/danh-muc/gom-su", true, ["Bát đĩa", "Ấm chén", "Nồi đất", "Lọ hoa"]),
    obj(C, "Quà Tết 2027", "/danh-muc/qua-tet-2027 · ẩn, chưa mở bán", false),
    obj(P, "Giảm 10% chảo gang với mã BEPMOC10", "Chảo gang 26, 28 cm", true),
    obj(P, "Miễn phí giao đơn từ 1.000.000 ₫", "Hàng Bếp Mộc bán", true),
    obj(SL, "Gốm Sứ Bát Tràng Xưa", "Bộ sưu tập gốm Bát Tràng · trên Chợ Bếp Mộc", true),
    obj(SL, "Mây Tre Đan Phú Vinh", "Giỏ mây đan tay · trên Chợ Bếp Mộc", true),
    obj(ST, "Bếp Mộc CN Quận 3", "/cua-hang/quan-3", true),
    obj(ST, "Bếp Mộc CN Cầu Giấy", "/cua-hang/cau-giay", true),
  ];
}

const objects = seed();

// Thay bằng GET /api/v1/kernel/resources/kinds (bước 51 P6) khi core có.
export async function listSampleRefKinds(): Promise<{ data: RefKind[] }> {
  return { data: [...SAMPLE_REF_KINDS] };
}

// Thay bằng tìm trong sổ đối tượng (bước 51 P6; loại do bước 34, 41, 43, 46 đăng ký) khi core có.
export async function listSampleRefObjects(): Promise<{ data: RefObject[] }> {
  return { data: objects.map((o) => ({ ...o, children: [...o.children] })) };
}
