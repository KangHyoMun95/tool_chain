// src/category-config/category-config.schema.ts
// Kiểm tra NGHIÊM NGẶT file config/categories/*.json. Cùng một bộ luật với bản Python (pydantic extra="forbid") ở apps/ai.
// Liệt kê TẤT CẢ lỗi (tên file + đường dẫn trường + lỗi gì), không dừng ở lỗi đầu tiên.
import { z } from "zod";
import { categoryConfigKey, normalizeName, RESULT_COLOR_RE, RESULT_SYMBOL_RE, type CategoryConfig } from "@toolhackchain/shared";

const NAME_MAX = 100;
const NUL = "\u0000";

const name = z.string().refine((v) => normalizeName(v) !== "", "không được rỗng")
  .refine((v) => !v.includes("|"), "không được chứa ký tự '|' (trùng dấu phân tách key_id)")
  .refine((v) => !v.includes(NUL), "không được chứa ký tự NUL")
  .refine((v) => v.trim().length <= NAME_MAX, `quá dài (tối đa ${NAME_MAX} ký tự)`);
const text = z.string().refine((v) => v.trim() !== "", "không được rỗng");
const resultDef = z.strictObject({
  label: z.strictObject({ vi: text, en: text }),
  color: z.string().regex(RESULT_COLOR_RE, "phải đúng dạng #RRGGBB"),
});

// Mọi khóa BẮT BUỘC; khóa lạ bị từ chối (strictObject). Quan hệ giữa các trường (ký hiệu, giao nhau) kiểm tra ở semanticIssues.
export const categoryConfigSchema = z.strictObject({
  lobby: name,
  category: name,
  results: z.record(z.string(), resultDef).refine((r) => Object.keys(r).length > 0, "phải có ít nhất một ký hiệu"),
  predictable: z.array(z.string()).min(1, "không được rỗng"),
  ignore_in_pattern: z.array(z.string()),
  draw: z.array(z.string()),
  totals: z.array(z.string()),
});

export type ConfigFile = { name: string; text: string };
export type ConfigLoadResult = { configs: CategoryConfig[]; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function fmtPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const p of path) out += typeof p === "number" ? `[${p}]` : `${out ? "." : ""}${String(p)}`;
  return out || "(gốc)";
}

/** Lỗi cấu trúc / kiểu / khóa thiếu / khóa lạ (từ zod). */
function structuralIssues(raw: unknown): { path: string; msg: string }[] {
  const out: { path: string; msg: string }[] = [];
  const res = categoryConfigSchema.safeParse(raw);
  if (res.success) return out;
  for (const i of res.error.issues) {
    if (i.code === "unrecognized_keys") {
      for (const k of i.keys) out.push({ path: fmtPath([...i.path, k]), msg: "khóa không được phép (không có trong schema)" });
    } else if (i.code === "invalid_type" && i.message.includes("received undefined")) {
      out.push({ path: fmtPath(i.path), msg: "thiếu khóa bắt buộc" });
    } else {
      out.push({ path: fmtPath(i.path), msg: i.message });
    }
  }
  return out;
}

/** Ký hiệu và quan hệ giữa các trường. Chạy trên dữ liệu thô, bỏ qua phần sai kiểu (zod đã báo) để không che lỗi khác. */
function semanticIssues(raw: Record<string, unknown>): { path: string; msg: string }[] {
  const out: { path: string; msg: string }[] = [];
  const add = (path: string, msg: string) => out.push({ path, msg });
  const results = isObj(raw.results) ? raw.results : null;
  const known = new Set<string>();
  if (results) {
    for (const k of Object.keys(results)) {
      if (!RESULT_SYMBOL_RE.test(k)) add(`results.${k}`, "ký hiệu phải là đúng một chữ in hoa (A-Z)");
      else known.add(k);
    }
  }
  const lists: Record<string, Set<string>> = {};
  for (const field of ["predictable", "ignore_in_pattern", "draw", "totals"] as const) {
    const arr = raw[field];
    if (!Array.isArray(arr)) continue;
    const seen = new Set<string>();
    arr.forEach((v, i) => {
      if (typeof v !== "string") return;   // sai kiểu: zod đã báo
      const p = `${field}[${i}]`;
      if (!RESULT_SYMBOL_RE.test(v)) return add(p, `"${v}" không phải ký hiệu hợp lệ (đúng một chữ in hoa A-Z)`);
      if (results && !known.has(v)) add(p, `"${v}" không có trong results`);
      if (seen.has(v)) add(p, `"${v}" bị trùng trong ${field}`);
      seen.add(v);
    });
    lists[field] = seen;
  }
  const overlap = (a: string, b: string) => {
    for (const v of lists[a] ?? []) if (lists[b]?.has(v)) add(a, `"${v}" nằm cả trong ${a} và ${b} (hai danh sách không được giao nhau)`);
  };
  overlap("predictable", "ignore_in_pattern");
  overlap("predictable", "draw");
  return out;
}

/**
 * Kiểm tra mọi file. `files` rỗng ⇒ lỗi. Trả configs (chỉ đáng tin khi errors rỗng) và TẤT CẢ lỗi, mỗi lỗi dạng
 * `<tên file>: <đường dẫn trường>: <lỗi gì>`. Trùng (lobby, category) sau khi chuẩn hóa tên cũng là lỗi.
 */
export function validateCategoryConfigFiles(files: ConfigFile[]): ConfigLoadResult {
  const errors: string[] = [];
  const configs: CategoryConfig[] = [];
  const owner = new Map<string, string>();
  if (files.length === 0) errors.push("không có file .json nào trong thư mục cấu hình category");

  for (const f of files) {
    let raw: unknown;
    try { raw = JSON.parse(f.text); } catch (e) {
      errors.push(`${f.name}: (gốc): không phải JSON hợp lệ (${(e as Error).message})`);
      continue;
    }
    if (!isObj(raw)) { errors.push(`${f.name}: (gốc): phải là một object JSON`); continue; }
    const issues = [...structuralIssues(raw), ...semanticIssues(raw)];
    for (const i of issues) errors.push(`${f.name}: ${i.path}: ${i.msg}`);
    if (issues.length > 0) continue;

    const cfg = raw as unknown as CategoryConfig;
    const key = categoryConfigKey(cfg.lobby, cfg.category);
    const first = owner.get(key);
    if (first) errors.push(`${f.name}: lobby/category: trùng với ${first} (lobby "${cfg.lobby}", category "${cfg.category}" sau khi chuẩn hóa tên)`);
    else { owner.set(key, f.name); configs.push(cfg); }
  }
  return { configs, errors };
}
