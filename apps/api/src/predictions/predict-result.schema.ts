// src/predictions/predict-result.schema.ts
// Kiểm tra payload của predict:results theo contract (packages/shared/src/ai.ts). Sai => null (caller log ERROR + XACK).
import type { ChosenPattern, PatternRow, PredictResult, PredictionReason } from "@toolhackchain/shared";
import { AI_SCHEMA_VERSION } from "@toolhackchain/shared";
import { toInt } from "../common/to-int.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS: readonly string[] = ["OK", "NOT_ENOUGH_HISTORY", "NO_ELIGIBLE_SUFFIX"];
const MAX_ROWS = 16;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isRatio = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;
const isRatioOrNull = (v: unknown): boolean => v === null || isRatio(v);

function row(v: unknown): PatternRow | null {
  if (!isObj(v)) return null;
  const k = toInt(v.k), b = toInt(v.count_B), p = toInt(v.count_P), total = toInt(v.total);
  if (k === null || b === null || p === null || total === null || total !== b + p) return null;
  if (typeof v.pattern !== "string" || !/^[BP]{1,10}$/.test(v.pattern) || typeof v.eligible !== "boolean") return null;
  if (!isRatioOrNull(v.pct_B) || !isRatioOrNull(v.pct_P)) return null;
  return v as PatternRow;
}

function chosen(v: unknown): ChosenPattern | null {
  if (!isObj(v)) return null;
  if (toInt(v.k) === null || toInt(v.occurrences) === null || typeof v.pattern !== "string" || !isRatio(v.pct_B) || !isRatio(v.pct_P)) return null;
  return v as ChosenPattern;
}

export function parsePredictResult(raw: unknown): PredictResult | null {
  if (!isObj(raw) || raw.schema_version !== AI_SCHEMA_VERSION) return null;
  if (!isUuid(raw.prediction_id) || !isUuid(raw.game_session_id) || !isUuid(raw.stream_id)) return null;
  if (!isStr(raw.key_id, 600) || toInt(raw.shoe) === null || toInt(raw.round) === null) return null;
  if (!REASONS.includes(raw.reason as string) || typeof raw.missing_previous !== "boolean") return null;
  if (typeof raw.history_used !== "string" || !/^[BP]{0,10}$/.test(raw.history_used)) return null;
  if (!isStr(raw.model_version, 50) || !isStr(raw.created_at, 40)) return null;
  if (!Array.isArray(raw.detail) || raw.detail.length > MAX_ROWS || !raw.detail.every((r) => row(r) !== null)) return null;

  // pick, confidence, chosen và reason phải nhất quán: có dự đoán khi và chỉ khi reason = OK (DB cũng ép bằng CHECK).
  const hasPick = raw.reason === ("OK" satisfies PredictionReason);
  if (hasPick) {
    if ((raw.pick !== "B" && raw.pick !== "P") || !isRatio(raw.confidence) || chosen(raw.chosen) === null) return null;
  } else if (raw.pick !== null || raw.confidence !== null || raw.chosen !== null) {
    return null;
  }
  return raw as unknown as PredictResult;
}
