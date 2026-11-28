// packages/shared/src/lucky-time.ts
// Parse bảng lịch "lucky time" của lobby NỔ HŨ (import từ file Excel / csv). HÀM THUẦN, không phụ thuộc thư viện: nhận bảng ô dạng text
// (dòng đầu là header) và trả các dòng đã tách giá trị + danh sách lỗi (số dòng, cột, lý do). Đọc file thành bảng: `lucky-time-file.ts`.
// Dùng ở trình duyệt (web-admin, xem trước) và ở API (import thật, đọc lại và kiểm tra toàn bộ file).

/** Tên cột trong file = tên cột của trang danh sách (so khớp không phân biệt hoa / thường và khoảng trắng thừa). Cả 7 cột bắt buộc có mặt. Cột "Tên game" = TÊN category của lobby NỔ HŨ (so khớp sau chuẩn hóa), bắt buộc; không có lịch dùng chung. */
export const LUCKY_TIME_COLUMNS = {
  game: "Tên game",
  time: "Thời gian dự đoán",
  confidence: "Khả năng nổ hũ",
  indicator: "Xu hướng hiện tại",
  circle: "Chu kỳ dự kiến",
  range: "Thời điểm đẹp",
  rtp: "Biến động RTP",
} as const;
export type LuckyTimeColumnKey = keyof typeof LUCKY_TIME_COLUMNS;

/** Một dòng đã tách, các trường trùng tên cột của bảng `lucky_time`. */
export interface LuckyTimeRow {
  /** Game của dòng: MÃ do `resolveGame` trả về (vd "AVIATOR"). Khi parser không nhận `resolveGame` là chữ gốc của file. Luôn có giá trị. */
  game: string;
  time_lucky: string; // "HH:MM"
  confidence: number; // 0..100, số nguyên
  indicator: string | null;
  circle_est_from: number;
  circle_est_to: number;
  range_lucky_time_from: number | null; // phút
  range_lucky_time_to: number | null;
  trace_next_circle: number | null; // dùng khi không có range ("N vòng tiếp theo")
  fluctuations_rtp: number; // numeric(5,2): 0..999.99
}

export interface LuckyTimeIssue {
  /** Số dòng trong file (dòng 1 của sheet = 1; tính cả dòng trống phía trên). null = lỗi cả file. */
  row: number | null;
  /** Tên cột (theo LUCKY_TIME_COLUMNS) hoặc null. */
  column: string | null;
  reason: string;
}

export interface LuckyTimeParsed {
  /** Dòng hợp lệ (đã bỏ dòng lỗi) kèm số dòng trong file. */
  rows: Array<{ row: number; data: LuckyTimeRow }>;
  /** Mọi lỗi: không bỏ qua im lặng dòng nào. */
  issues: LuckyTimeIssue[];
  /** Mọi dòng có dữ liệu (kể cả dòng lỗi) theo thứ tự file, để hiển thị xem trước. */
  preview: Array<{ row: number; cells: Record<LuckyTimeColumnKey, string>; data: LuckyTimeRow | null; issues: LuckyTimeIssue[] }>;
}

export const LUCKY_TIME_MAX_ROWS = 2000;

const DASH = "[-\\u2010-\\u2015\\u2212~]"; // - ‐ ‑ ‒ – — ― − ~
const RANGE_SEP = `(?:${DASH}|đến)`;
const NUM = "(\\d+(?:[.,]\\d+)?)";

/** NFC + thường + gộp khoảng trắng (kể cả khoảng trắng không ngắt) để so khớp. */
function norm(s: string): string {
  return s.normalize("NFC").replace(/[\s ]+/g, " ").trim().toLowerCase();
}

const toNumber = (s: string): number => Number(s.replace(",", "."));

function parseTime(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  const s = norm(raw);
  let m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  let h: number, min: number;
  if (m) {
    h = Number(m[1]);
    min = Number(m[2]);
    if (m[3] !== undefined && Number(m[3]) !== 0) return { ok: false, reason: `Giây phải là 00 (nhận "${raw}")` };
  } else if ((m = /^(\d?\.\d+)$/.exec(s)) && Number(s) < 1) {
    // Ô giờ của Excel để dạng số (phần của ngày): 0.0520833 = 01:15
    const total = Math.round(Number(s) * 1440);
    h = Math.floor(total / 60) % 24;
    min = total % 60;
  } else {
    return { ok: false, reason: `Giờ không hợp lệ: "${raw}" (mong đợi HH:MM, ví dụ 00:00 hoặc 1:15)` };
  }
  if (h > 23 || min > 59) return { ok: false, reason: `Giờ ngoài phạm vi 00:00..23:59: "${raw}"` };
  return { ok: true, value: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
}

function parseConfidence(raw: string): { ok: true; value: number } | { ok: false; reason: string } {
  const m = new RegExp(`^${NUM}\\s*%?$`).exec(norm(raw));
  if (!m) return { ok: false, reason: `Khả năng nổ hũ không hợp lệ: "${raw}" (ví dụ 99% hoặc 99)` };
  const v = toNumber(m[1]);
  if (!Number.isInteger(v)) return { ok: false, reason: `Khả năng nổ hũ phải là số nguyên: "${raw}"` };
  if (v < 0 || v > 100) return { ok: false, reason: `Khả năng nổ hũ phải trong 0..100: "${raw}"` };
  return { ok: true, value: v };
}

function parseInts(m: RegExpExecArray): [number, number] {
  return [Number(m[1]), Number(m[2])];
}

function parseCircle(raw: string): { ok: true; from: number; to: number } | { ok: false; reason: string } {
  const m = new RegExp(`^(\\d+)\\s*${RANGE_SEP}\\s*(\\d+)\\s*(?:vòng)?$`).exec(norm(raw));
  if (!m) return { ok: false, reason: `Chu kỳ dự kiến không hợp lệ: "${raw}" (ví dụ "20 - 30 vòng")` };
  const [from, to] = parseInts(m);
  if (from > to) return { ok: false, reason: `Chu kỳ dự kiến: giá trị đầu lớn hơn giá trị sau: "${raw}"` };
  return { ok: true, from, to };
}

type RangeParse =
  | { ok: true; kind: "range"; from: number; to: number }
  | { ok: true; kind: "next"; circles: number }
  | { ok: false; reason: string };

function parseRange(raw: string): RangeParse {
  const s = norm(raw);
  let m = new RegExp(`^(\\d+)\\s*${RANGE_SEP}\\s*(\\d+)\\s*phút$`).exec(s);
  if (m) {
    const [from, to] = parseInts(m);
    if (from > to) return { ok: false, reason: `Thời điểm đẹp: giá trị đầu lớn hơn giá trị sau: "${raw}"` };
    return { ok: true, kind: "range", from, to };
  }
  m = /^(\d+)\s*vòng\s*tiếp\s*theo$/.exec(s);
  if (m) return { ok: true, kind: "next", circles: Number(m[1]) };
  return { ok: false, reason: `Thời điểm đẹp không hợp lệ: "${raw}" (ví dụ "1 - 4 phút" hoặc "5 vòng tiếp theo")` };
}

function parseRtp(raw: string): { ok: true; value: number } | { ok: false; reason: string } {
  const m = new RegExp(`^${NUM}\\s*%?$`).exec(norm(raw));
  if (!m) return { ok: false, reason: `Biến động RTP không hợp lệ: "${raw}" (ví dụ 99.2% hoặc 99,2)` };
  const v = Math.round(toNumber(m[1]) * 100) / 100; // cột numeric(5,2): làm tròn 2 chữ số thập phân
  if (v < 0 || v > 999.99) return { ok: false, reason: `Biến động RTP phải trong 0..999.99: "${raw}"` };
  return { ok: true, value: v };
}

const KEYS = Object.keys(LUCKY_TIME_COLUMNS) as LuckyTimeColumnKey[];

/**
 * Tách bảng text thành các dòng lucky time. `table[0]` là header (dòng đầu tiên có ô không trống; dòng trống phía trên được bỏ qua nhưng vẫn tính vào số dòng).
 * firstRow: số dòng (trong file) của `table[0]`, mặc định 1.
 * resolveGame: đổi chữ trong cột Game thành MÃ game (xem `resolveNoHuGame`: so khớp BẰNG NHAU sau chuẩn hóa với tên vi / en / MÃ, không contains); null ⇒ lỗi dòng (kèm giá trị gốc). Trình duyệt và server dùng CHUNG hàm này. Không truyền ⇒ giữ chữ gốc.
 * Trùng giờ được xét RIÊNG cho từng game.
 * Dòng trống hoàn toàn bị bỏ qua. Hai dòng trùng giờ ⇒ dòng sau báo lỗi. Thiếu cột bắt buộc ⇒ lỗi cả file (rows rỗng).
 */
export function parseLuckyTimeTable(table: string[][], firstRow = 1, resolveGame?: (raw: string) => string | null): LuckyTimeParsed {
  const out: LuckyTimeParsed = { rows: [], issues: [], preview: [] };
  const blank = (r: string[]) => r.every((c) => (c ?? "").toString().trim() === "");
  const headerAt = table.findIndex((r) => !blank(r));
  if (headerAt < 0) {
    out.issues.push({ row: null, column: null, reason: "File trống" });
    return out;
  }

  const header = table[headerAt].map((c) => norm(String(c ?? "")));
  const col: Partial<Record<LuckyTimeColumnKey, number>> = {};
  for (const k of KEYS) {
    const idx = header.indexOf(norm(LUCKY_TIME_COLUMNS[k]));
    if (idx >= 0) col[k] = idx;
  }
  const missing = KEYS.filter((k) => col[k] === undefined);
  if (missing.length) {
    out.issues.push({ row: firstRow + headerAt, column: null, reason: `Thiếu cột bắt buộc: ${missing.map((k) => `"${LUCKY_TIME_COLUMNS[k]}"`).join(", ")}` });
    return out;
  }
  const dup = KEYS.filter((k) => header.filter((h) => h === norm(LUCKY_TIME_COLUMNS[k])).length > 1);
  if (dup.length) {
    out.issues.push({ row: firstRow + headerAt, column: null, reason: `Cột xuất hiện nhiều lần: ${dup.map((k) => `"${LUCKY_TIME_COLUMNS[k]}"`).join(", ")}` });
    return out;
  }

  const seenTime = new Map<string, number>(); // khóa: game + giờ
  let dataRows = 0;
  for (let i = headerAt + 1; i < table.length; i++) {
    const cells = table[i];
    if (blank(cells)) continue;
    const rowNo = firstRow + i;
    if (++dataRows > LUCKY_TIME_MAX_ROWS) {
      out.issues.push({ row: rowNo, column: null, reason: `File có quá ${LUCKY_TIME_MAX_ROWS} dòng dữ liệu` });
      break;
    }
    const get = (k: LuckyTimeColumnKey) => String(cells[col[k]!] ?? "").normalize("NFC").trim();
    const raw = Object.fromEntries(KEYS.map((k) => [k, get(k)])) as Record<LuckyTimeColumnKey, string>;
    const rowIssues: LuckyTimeIssue[] = [];
    const fail = (k: LuckyTimeColumnKey, reason: string) => rowIssues.push({ row: rowNo, column: LUCKY_TIME_COLUMNS[k], reason });

    // Thiếu giá trị: chỉ "Xu hướng hiện tại" được trống (lưu NULL).
    let ok = true;
    for (const k of KEYS) {
      if (k !== "indicator" && raw[k] === "") {
        fail(k, "Thiếu giá trị");
        ok = false;
      }
    }

    const data: Partial<LuckyTimeRow> = { indicator: raw.indicator === "" ? null : raw.indicator };
    let gameKey: string | null = null;
    if (raw.game !== "") {
      const code = resolveGame ? resolveGame(raw.game) : raw.game;
      if (code === null) {
        fail("game", `Game không khớp: "${raw.game}" (dùng đúng tên tiếng Việt, tiếng Anh hoặc mã của game)`);
      } else {
        data.game = code;
        gameKey = code;
      }
    }
    if (raw.time !== "") {
      const r = parseTime(raw.time);
      if (!r.ok) fail("time", r.reason);
      else {
        data.time_lucky = r.value;
        if (gameKey !== null) {
          const key = `${gameKey}|${r.value}`;
          const prev = seenTime.get(key);
          if (prev !== undefined) fail("time", `Trùng giờ ${r.value} (cùng game) với dòng ${prev}`);
          else seenTime.set(key, rowNo);
        }
      }
    }
    if (raw.confidence !== "") {
      const r = parseConfidence(raw.confidence);
      if (!r.ok) fail("confidence", r.reason);
      else data.confidence = r.value;
    }
    if (raw.circle !== "") {
      const r = parseCircle(raw.circle);
      if (!r.ok) fail("circle", r.reason);
      else {
        data.circle_est_from = r.from;
        data.circle_est_to = r.to;
      }
    }
    if (raw.range !== "") {
      const r = parseRange(raw.range);
      if (!r.ok) fail("range", r.reason);
      else if (r.kind === "range") {
        data.range_lucky_time_from = r.from;
        data.range_lucky_time_to = r.to;
        data.trace_next_circle = null;
      } else {
        data.range_lucky_time_from = null;
        data.range_lucky_time_to = null;
        data.trace_next_circle = r.circles;
      }
    }
    if (raw.rtp !== "") {
      const r = parseRtp(raw.rtp);
      if (!r.ok) fail("rtp", r.reason);
      else data.fluctuations_rtp = r.value;
    }

    const valid = ok && rowIssues.length === 0;
    out.issues.push(...rowIssues);
    if (valid) out.rows.push({ row: rowNo, data: data as LuckyTimeRow });
    out.preview.push({ row: rowNo, cells: raw, data: valid ? (data as LuckyTimeRow) : null, issues: rowIssues });
  }
  if (dataRows === 0) out.issues.push({ row: null, column: null, reason: "File không có dòng dữ liệu" });
  return out;
}
