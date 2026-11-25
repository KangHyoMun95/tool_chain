// src/predictions/predict-result.schema.ts
// Kiểm tra payload của predict:results theo contract (packages/shared/src/ai.ts). Sai => null (caller log ERROR + XACK).
import type { CategoryConfig, ChosenPattern, PatternRow, PredictResult, PredictionReason } from "@toolhackchain/shared";
import { AI_SCHEMA_VERSION } from "@toolhackchain/shared";
import { toInt } from "../common/to-int.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS: readonly string[] = ["OK", "NOT_ENOUGH_HISTORY", "NO_ELIGIBLE_SUFFIX"];
const MAX_ROWS = 16;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isRatio = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;
const isNonNegNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isRatioOrNull = (v: unknown): boolean => v === null || isRatio(v);

const sameKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean => {
  const k = Object.keys(o);
  return k.length === keys.length && keys.every((x) => Object.hasOwn(o, x));
};

function row(v: unknown, cfg: CategoryConfig): PatternRow | null {
  if (!isObj(v)) return null;
  const k = toInt(v.k);
  if (k === null || !isNonNegNumber(v.total) || typeof v.eligible !== "boolean") return null;
  if (typeof v.pattern !== "string" || !/^[A-Z]{1,10}$/.test(v.pattern) || ![...v.pattern].every((c) => Object.hasOwn(cfg.results, c))) return null;
  if (!isObj(v.counts) || !sameKeys(v.counts, cfg.predictable) || !isObj(v.pct) || !sameKeys(v.pct, cfg.predictable)) return null;
  // counts / total là số CÓ trọng số (số thực >= 0); total = tổng counts (cho phép sai số làm tròn khi AI làm tròn từng ô).
  let sum = 0;
  for (const s of cfg.predictable) {
    const n = v.counts[s];
    if (!isNonNegNumber(n) || !isRatioOrNull(v.pct[s])) return null;
    sum += n;
  }
  return Math.abs(sum - (v.total as number)) <= 1e-3 * Math.max(1, sum) ? (v as unknown as PatternRow) : null;
}

function chosen(v: unknown, cfg: CategoryConfig): ChosenPattern | null {
  if (!isObj(v)) return null;
  if (toInt(v.k) === null || !isNonNegNumber(v.occurrences) || typeof v.pattern !== "string") return null;
  if (!isObj(v.pct) || !sameKeys(v.pct, cfg.predictable) || !cfg.predictable.every((s) => isRatio(v.pct && (v.pct as Record<string, unknown>)[s]))) return null;
  return v as unknown as ChosenPattern;
}

/** `configOf(key_id)`: cấu hình category của stream (không có ⇒ message bị coi là sai contract). */
export function parsePredictResult(raw: unknown, configOf: (keyId: string) => CategoryConfig | undefined): PredictResult | null {
  if (!isObj(raw) || raw.schema_version !== AI_SCHEMA_VERSION) return null;
  if (!isUuid(raw.prediction_id) || !isUuid(raw.game_session_id) || !isUuid(raw.stream_id)) return null;
  if (!isStr(raw.key_id, 600) || toInt(raw.shoe) === null || toInt(raw.round) === null) return null;
  const cfg = configOf(raw.key_id);
  if (!cfg) return null;
  if (!REASONS.includes(raw.reason as string) || typeof raw.missing_previous !== "boolean") return null;
  if (typeof raw.history_used !== "string" || !/^[A-Z]{0,10}$/.test(raw.history_used)
      || ![...raw.history_used].every((c) => Object.hasOwn(cfg.results, c) && !cfg.ignore_in_pattern.includes(c))) return null;
  if (!isStr(raw.model_version, 50) || !isStr(raw.created_at, 40)) return null;
  // Cấu hình trọng số đã dùng (bắt buộc có khóa): half_life_minutes null = tắt; shoe_weight null khi tắt, ngược lại số nguyên >= 1.
  const halfLife = raw.half_life_minutes, shoeWeight = raw.shoe_weight;
  if (halfLife !== null && (toInt(halfLife) === null || (halfLife as number) < 1)) return null;
  if (shoeWeight !== null && (toInt(shoeWeight) === null || (shoeWeight as number) < 1)) return null;
  if ((halfLife === null) !== (shoeWeight === null)) return null;
  if (!Array.isArray(raw.detail) || raw.detail.length > MAX_ROWS || !raw.detail.every((r) => row(r, cfg) !== null)) return null;

  // pick, confidence, chosen và reason phải nhất quán: có dự đoán khi và chỉ khi reason = OK (DB cũng ép bằng CHECK).
  // pick phải thuộc predictable của category (DB chỉ kiểm tra định dạng ^[A-Z]$).
  const hasPick = raw.reason === ("OK" satisfies PredictionReason);
  if (hasPick) {
    if (typeof raw.pick !== "string" || !cfg.predictable.includes(raw.pick) || !isRatio(raw.confidence) || chosen(raw.chosen, cfg) === null) return null;
  } else if (raw.pick !== null || raw.confidence !== null || raw.chosen !== null) {
    return null;
  }
  return raw as unknown as PredictResult;
}
