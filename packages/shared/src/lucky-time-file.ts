// packages/shared/src/lucky-time-file.ts
// Đọc file lịch lucky time (xlsx, xls, csv, ...) thành bảng text rồi gọi parseLuckyTimeTable. Phụ thuộc SheetJS (`xlsx` 0.20.3, tarball ở vendor/),
// nên TÁCH RIÊNG khỏi index: import qua subpath `@toolhackchain/shared/lucky-time-file` để nơi không đọc file không bị kéo thư viện vào bundle.
import * as XLSX from "xlsx";
import { LuckyTimeParsed, parseLuckyTimeTable } from "./lucky-time";

export const LUCKY_TIME_MAX_FILE_BYTES = 5 * 1024 * 1024;

function failed(reason: string): LuckyTimeParsed {
  return { rows: [], preview: [], issues: [{ row: null, column: null, reason }] };
}

/** Đọc `data` (nội dung file) thành bảng text của sheet đầu tiên rồi parse. Lỗi đọc file ⇒ một lỗi cả file (không ném). */
export function readLuckyTimeFile(data: ArrayBuffer | Uint8Array, resolveGame?: (raw: string) => string | null): LuckyTimeParsed {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength === 0) return failed("File trống");
  if (bytes.byteLength > LUCKY_TIME_MAX_FILE_BYTES) return failed(`File quá lớn (tối đa ${LUCKY_TIME_MAX_FILE_BYTES / 1024 / 1024}MB)`);
  try {
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // xlsx, xlsm, ods... (PK)
    const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0; // xls (OLE2)
    let wb: XLSX.WorkBook;
    if (isZip || isOle) {
      wb = XLSX.read(bytes, { type: "array", cellDates: false });
    } else {
      // csv / văn bản: tự giải mã UTF-8 (có / không BOM) và giữ mọi ô là chuỗi gốc (raw), không để thư viện đoán số / phần trăm / ngày.
      const text = new TextDecoder("utf-8").decode(bytes);
      wb = XLSX.read(text, { type: "string", raw: true });
    }
    const name = wb.SheetNames[0];
    const ws = name ? wb.Sheets[name] : undefined;
    if (!ws || !ws["!ref"]) return failed("File không có dữ liệu");
    const firstRow = XLSX.utils.decode_range(ws["!ref"]).s.r + 1; // sheet có thể bắt đầu ở dòng > 1
    // raw:false ⇒ dùng chuỗi ĐÃ ĐỊNH DẠNG của ô (ô "99%" ra "99%", ô giờ ra "1:15") thay vì số thô.
    const table = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, blankrows: true, defval: "" }).map((r) => r.map((c) => String(c ?? "")));
    return parseLuckyTimeTable(table, firstRow, resolveGame);
  } catch (e) {
    return failed(`Không đọc được file: ${e instanceof Error ? e.message : String(e)}`);
  }
}
