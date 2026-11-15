import { beforeEach, describe, expect, it } from "vitest";
import {
  addPrice,
  createPriceList,
  createProduct,
  decideSuggestion,
  getProduct,
  gtinValid,
  listProducts,
  listSuggestions,
  moveCategory,
  ORG,
  PRICE_LIST_ID,
  PRODUCT_ID,
  previewImport,
  putMedia,
  readCsv,
  resetSampleCatalog,
  resolvePrice,
  runImport,
  saveVariant,
  setPriceListActive,
  setProductStatus,
  storePrices,
  VARIANT_ID,
  variantByCode,
} from "./catalog";

beforeEach(resetSampleCatalog);

const vn = (day: string, time = "10:00") => new Date(`${day}T${time}:00+07:00`).toISOString();

describe("sản phẩm mẫu (chờ module catalog, bước 41)", () => {
  it("tìm không dấu theo tên và SKU, lọc theo trạng thái và danh mục cả nhánh", async () => {
    expect((await listProducts({ q: "chao gang" })).data.map((p) => p.id)).toContain(
      PRODUCT_ID.castIronPan,
    );
    expect((await listProducts({ q: "cg26" })).data.map((p) => p.id)).toEqual([
      PRODUCT_ID.castIronPan,
    ]);
    const drafts = await listProducts({ status: "draft" });
    expect(drafts.data.every((p) => p.status === "draft")).toBe(true);
    const blocked = await listProducts({ blocked: true });
    expect(blocked.data.map((p) => p.id).sort()).toEqual(
      [PRODUCT_ID.fishSauce, PRODUCT_ID.potSet].sort(),
    );
    const pan = (await listProducts({ q: "chảo gang" })).data[0];
    expect(pan?.price_min?.amount).toBe("590000");
    expect(pan?.price_max?.amount).toBe("760000");
  });

  it("phân trang theo con trỏ như fetch_page", async () => {
    const first = await listProducts({ limit: 5 });
    expect(first.data).toHaveLength(5);
    const second = await listProducts({ limit: 5, cursor: first.pagination.next_cursor });
    expect(second.data[0]?.id).not.toBe(first.data[0]?.id);
  });

  it("mở bán kiểm thuộc tính bắt buộc, nhóm thuế và giấy tờ; báo mọi điều thiếu một lần", async () => {
    const pot = await setProductStatus(PRODUCT_ID.potSet, "active");
    expect(pot.ok).toBe(false);
    if (!pot.ok) {
      const codes = (pot.problem.errors ?? []).map((e) => e.code);
      expect(codes).toContain("catalog.tax_category_unknown");
      expect(codes).toContain("catalog.required_attributes_missing");
    }
    const sauce = await setProductStatus(PRODUCT_ID.fishSauce, "active");
    expect(!sauce.ok && sauce.problem.code).toBe("catalog.documents_required");
    const wrong = await setProductStatus(PRODUCT_ID.castIronPan, "archived");
    expect(!wrong.ok && wrong.problem.code).toBe("catalog.invalid_status_transition");
    const stop = await setProductStatus(PRODUCT_ID.castIronPan, "inactive");
    expect(stop.ok && stop.data.previous).toBe("active");
  });

  it("SKU duy nhất trong khách; mã vạch kiểm chữ số kiểm tra", async () => {
    const taken = await createProduct({
      name: "Chảo mới",
      kind: "physical",
      category_id: (await getProduct(PRODUCT_ID.castIronPan))?.data.primary_category_id ?? "",
      tax_category: "vat.standard",
      sku: "cg26",
    });
    expect(!taken.ok && taken.problem.code).toBe("catalog.sku_taken");
    expect(gtinValid("8930000000019")).toBe(true);
    expect(gtinValid("8930000000010")).toBe(false);
    expect(gtinValid("ABC-1")).toBe(true);
    const bad = await saveVariant(PRODUCT_ID.castIronPan, null, {
      sku: "CG30",
      barcode: "8930000000010",
      option_value: "30 cm",
      option_name: "",
      weight_grams: "abc",
      length_mm: "",
      width_mm: "",
      height_mm: "",
    });
    expect(!bad.ok && (bad.problem.errors ?? []).map((e) => e.field).sort()).toEqual([
      "barcode",
      "weight_grams",
    ]);
    const same = await saveVariant(PRODUCT_ID.castIronPan, null, {
      sku: "CG26B",
      barcode: "",
      option_value: "26 cm",
      option_name: "",
      weight_grams: "",
      length_mm: "",
      width_mm: "",
      height_mm: "",
    });
    expect(!same.ok && same.problem.code).toBe("catalog.option_combination_taken");
  });

  it("ảnh sản phẩm phải là media công khai", async () => {
    const id = "0193a0c4-7d1e-7c2a-9b1e-3f2d5c6b7a81";
    const priv = await putMedia(PRODUCT_ID.castIronPan, [
      { media_id: id, variant_id: null, alt: "Chảo", public: false },
    ]);
    expect(!priv.ok && priv.problem.code).toBe("catalog.media_not_public");
    const ok = await putMedia(PRODUCT_ID.castIronPan, [
      { media_id: id, variant_id: VARIANT_ID.CG26, alt: "Chảo", public: true },
    ]);
    expect(ok.ok).toBe(true);
    expect((await variantByCode("CG24")).data?.image_media_id).toBe(id);
  });

  it("dời danh mục vào chính nhánh con của nó bị từ chối", async () => {
    const product = await getProduct(PRODUCT_ID.castIronPan);
    const pans = product?.data.primary_category_id ?? "";
    const { data } = await import("./catalog").then((m) => m.listCategories());
    const kitchen = data.find((c) => c.path === "Bếp")?.id ?? "";
    const cycle = await moveCategory(kitchen, pans);
    expect(!cycle.ok && cycle.problem.code).toBe("catalog.category_cycle");
  });
});

describe("giá mẫu: kế thừa, ghi đè, lịch sử", () => {
  it("cửa hàng ghi đè giá chuỗi; không có dòng thì kế thừa trụ sở", async () => {
    const bowl = await resolvePrice({
      variant_id: VARIANT_ID.BG6,
      org_id: ORG.CG,
      at: vn("2026-11-13"),
    });
    expect(bowl.ok && bowl.data.price?.amount.amount).toBe("440000");
    const pan = await resolvePrice({
      variant_id: VARIANT_ID.CG26,
      org_id: ORG.CG,
      at: vn("2026-11-13"),
    });
    expect(pan.ok && pan.data.price?.price_list_id).toBe(PRICE_LIST_ID.retail);
    expect(
      pan.ok && pan.data.candidates.find((c) => c.price_list_id === PRICE_LIST_ID.caugiay)?.outcome,
    ).toBe("no_price");
    const other = await resolvePrice({
      variant_id: VARIANT_ID.BG6,
      org_id: ORG.Q3,
      at: vn("2026-11-13"),
    });
    expect(other.ok && other.data.price?.amount.amount).toBe("420000");
  });

  it("giá hẹn giờ, giá cũ, bảng tắt và nhóm khách", async () => {
    const at = async (day: string, group: string | null = null) => {
      const r = await resolvePrice({
        variant_id: VARIANT_ID.CG26,
        org_id: ORG.Q3,
        at: vn(day),
        customer_group: group,
      });
      return r.ok ? r.data.price?.amount.amount : null;
    };
    expect(await at("2027-01-02")).toBe("703000");
    expect(await at("2026-08-01")).toBe("720000");
    // Bảng Tết đã tắt và bảng bán lẻ chưa có dòng nào trước 01/7/2026.
    expect(await at("2026-02-01")).toBeUndefined();
    expect(await at("2026-11-13", "SI-NHAHANG")).toBe("560000");
    await setPriceListActive(PRICE_LIST_ID.tet, true);
    expect(await at("2026-02-01")).toBe("650000");
  });

  it("dòng giá chỉ thêm; cùng mã tham chiếu không thêm hai lần", async () => {
    const input = {
      price_list_id: PRICE_LIST_ID.retail,
      code: "CG24",
      amount: "600000",
      compare_at: "",
      valid_from: "2027-02-01T00:00",
      reference: "test-1",
    };
    const first = await addPrice(input);
    const again = await addPrice(input);
    expect(first.ok && first.data.replayed).toBe(false);
    expect(again.ok && again.data.replayed).toBe(true);
    const reused = await addPrice({ ...input, amount: "610000" });
    expect(!reused.ok && reused.problem.code).toBe("reference_reused");
    const comma = await addPrice({ ...input, amount: "1.000,50", reference: "test-2" });
    expect(!comma.ok && comma.problem.errors?.[0]?.code).toBe("money_minor");
  });

  it("bảng giá cho người tiêu dùng ở Việt Nam phải VND và gồm thuế", async () => {
    const usd = await createPriceList({
      name: "X",
      org_id: ORG.ROOT,
      audience: "consumer",
      currency: "USD",
      tax_inclusive: true,
      customer_group: "",
      priority: "0",
    });
    expect(!usd.ok && usd.problem.code).toBe("catalog.consumer_price_rules");
    const b2b = await createPriceList({
      name: "Sỉ",
      org_id: ORG.ROOT,
      audience: "business",
      currency: "VND",
      tax_inclusive: false,
      customer_group: "",
      priority: "1",
    });
    expect(b2b.ok).toBe(true);
  });

  it("giá theo cửa hàng ghi rõ ghi đè hay kế thừa", async () => {
    const { data } = await storePrices(ORG.CG);
    expect(data.find((r) => r.sku === "BG6")?.source).toBe("override");
    expect(data.find((r) => r.sku === "CG26")?.source).toBe("inherited");
    expect(data.find((r) => r.sku === "BNI3")?.source).toBeNull();
  });
});

describe("nhập CSV có chạy thử", () => {
  const csv =
    '﻿sku,name,category,tax_category,price\r\nCG26,,,,695000\r\nNEW1,"Nồi, gang mới",Bếp › Nồi,vat.standard_reducible,450000\r\nBAD,,,,1.000,50\r\nNEW1,x,Bếp,vat.standard,1\r\n';

  it("đọc CSV theo RFC 4180 (BOM, CRLF, ngoặc kép)", () => {
    const { rows } = readCsv(csv, 100);
    expect(rows[2]).toEqual([
      "NEW1",
      "Nồi, gang mới",
      "Bếp › Nồi",
      "vat.standard_reducible",
      "450000",
    ]);
  });

  it("chạy thử không ghi gì; dòng lỗi không chặn dòng đúng; nhập lại không tạo trùng", async () => {
    const preview = await previewImport(csv, "upsert");
    expect(preview.ok && [preview.data.create, preview.data.update]).toEqual([1, 1]);
    expect(preview.ok && preview.data.errors.map((e) => `${e.row}:${e.code}`)).toContain(
      "5:duplicate_in_file",
    );
    expect((await variantByCode("NEW1")).data).toBeNull();
    const run = await runImport(csv, "upsert", "test.csv");
    expect(run.ok && run.data.status).toBe("done_err");
    expect((await variantByCode("NEW1")).data?.name).toBe("Nồi, gang mới");
    const again = await previewImport(csv, "upsert");
    expect(again.ok && again.data.create).toBe(0);
  });
});

describe("bản nháp AI chỉ là gợi ý", () => {
  it("áp dụng chép vào bản dịch và bật ai_assisted; đã quyết thì không quyết lại", async () => {
    const [draft] = (await listSuggestions({ product_id: PRODUCT_ID.blueBowls, status: "pending" }))
      .data;
    expect((await getProduct(PRODUCT_ID.blueBowls))?.data.ai_assisted).toBe(false);
    const applied = await decideSuggestion(draft?.id ?? "", true);
    expect(applied.ok).toBe(true);
    const product = (await getProduct(PRODUCT_ID.blueBowls))?.data;
    expect(product?.ai_assisted).toBe(true);
    expect(product?.translations.find((t) => t.locale === "vi")?.description).toContain("men lam");
    const twice = await decideSuggestion(draft?.id ?? "", false);
    expect(!twice.ok && twice.problem.code).toBe("catalog.suggestion_decided");
  });
});
