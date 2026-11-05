/** `streamer_id` của nguồn có dạng "Tên/Quốc gia/Mã" (vd "Bayle/Colombia/1501475"). Dùng làm dự phòng khi chưa có streamer_name / streamer_country từ realtime. */
export function parseStreamer(raw: string | null | undefined): { name: string | null; country: string | null } {
  if (!raw) return { name: null, country: null };
  const [name, country] = raw.split("/").map((s) => s.trim());
  return { name: name || null, country: country || null };
}
