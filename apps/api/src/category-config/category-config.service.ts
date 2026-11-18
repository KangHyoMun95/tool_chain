// src/category-config/category-config.service.ts
// Nạp config/categories/*.json lúc khởi động (sai ⇒ app KHÔNG khởi động) và tra cấu hình theo (lobby, category) đã chuẩn hóa.
// Tick của category không có file, hoặc actual_result ngoài `results` ⇒ bị từ chối (ingestion, hub, predict-trigger dùng chung inspectTick).
import { Injectable, Logger } from "@nestjs/common";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { categoryConfigKey, type CategoryConfig, type ResultConfig } from "@toolhackchain/shared";
import { BoundedMap } from "../ingestion/bounded-map.js";
import { validateCategoryConfigFiles } from "./category-config.schema.js";

const REJECT_LOG_INTERVAL_MS = 60_000;

export type TickInspection =
  | { ok: true; config: CategoryConfig; result: string | null }
  | { ok: false; code: "NO_CONFIG" | "BAD_RESULT"; key: string; message: string };

/** CATEGORY_CONFIG_DIR, hoặc config/categories ở thư mục chạy (docker: /app) / ở gốc repo (chạy từ apps/api). */
export function resolveConfigDir(): string {
  const env = process.env.CATEGORY_CONFIG_DIR?.trim();
  if (env) return resolve(env);
  const candidates = [resolve(process.cwd(), "config/categories"), resolve(process.cwd(), "../../config/categories")];
  return candidates.find((d) => existsSync(d)) ?? candidates[0];
}

@Injectable()
export class CategoryConfigService {
  private readonly log = new Logger(CategoryConfigService.name);
  private readonly configs = new Map<string, CategoryConfig>();
  private readonly lastReject = new BoundedMap<string, number>(1000);

  constructor() {
    const dir = resolveConfigDir();
    let files: { name: string; text: string }[];
    try {
      files = readdirSync(dir).filter((n) => n.endsWith(".json")).sort()
        .map((n) => ({ name: n, text: readFileSync(join(dir, n), "utf8") }));
    } catch (e) {
      throw new Error(`Cấu hình category không hợp lệ: không đọc được thư mục ${dir} (${(e as Error).message})`);
    }
    const { configs, errors } = validateCategoryConfigFiles(files);
    if (errors.length > 0) {
      throw new Error(`Cấu hình category không hợp lệ (${dir}), ${errors.length} lỗi:\n  ${errors.join("\n  ")}`);
    }
    for (const c of configs) this.configs.set(categoryConfigKey(c.lobby, c.category), c);
    this.log.log(`Đã nạp ${configs.length} category: ${configs.map((c) => `${c.lobby}|${c.category}`).join(", ")}`);
  }

  get(lobby: string, category: string): CategoryConfig | undefined {
    return this.configs.get(categoryConfigKey(lobby, category));
  }

  /** key_id = `<lobby>|<category>|<stream>` đã chuẩn hóa. */
  getByKeyId(keyId: string): CategoryConfig | undefined {
    const [lobby, category] = keyId.split("|");
    return lobby === undefined || category === undefined ? undefined : this.configs.get(`${lobby}|${category}`);
  }

  /** Phần cấu hình trả cho portal; null khi category không có file. */
  resultConfig(lobby: string, category: string): ResultConfig | null {
    const c = this.get(lobby, category);
    return c ? { results: c.results, predictable: c.predictable, draw: c.draw, totals: c.totals } : null;
  }

  /** Kiểm tra `data` của một tick: category phải có file và actual_result (nếu có) phải thuộc results. Không log. */
  inspectTick(data: unknown): TickInspection {
    const d = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    const lobby = typeof d.lobby_name === "string" ? d.lobby_name : "";
    const category = typeof d.category_name === "string" ? d.category_name : "";
    const key = categoryConfigKey(lobby, category);
    const config = lobby && category ? this.configs.get(key) : undefined;
    if (!config) {
      return { ok: false, code: "NO_CONFIG", key, message: `category "${lobby}" / "${category}" không có file định nghĩa trong config/categories` };
    }
    const ar = d.actual_result;
    if (ar === null || ar === undefined) return { ok: true, config, result: null };
    const result = typeof ar === "string" ? ar.trim() : null;
    if (result === "") return { ok: true, config, result: null };
    if (result === null || !Object.hasOwn(config.results, result)) {
      return { ok: false, code: "BAD_RESULT", key, message: `actual_result ${JSON.stringify(ar)} không thuộc results của ${key} (${Object.keys(config.results).join(", ")})` };
    }
    return { ok: true, config, result };
  }

  /** Log ERROR cho tick bị từ chối, tối đa 1 dòng / phút / (mã lỗi, khóa). */
  reportRejected(r: Extract<TickInspection, { ok: false }>): void {
    const k = `${r.code}:${r.key}`;
    const now = Date.now();
    if (now - (this.lastReject.get(k) ?? 0) < REJECT_LOG_INTERVAL_MS) return;
    this.lastReject.set(k, now);
    this.log.error(`Từ chối tick: ${r.message}`);
  }
}
