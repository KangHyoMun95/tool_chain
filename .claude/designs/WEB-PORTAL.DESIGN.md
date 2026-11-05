# TOOL HACK AI — CYBERPUNK NEON RED HUD
## UI/UX Design Specification — web-portal (cổng cho User)

> Design contract riêng của `apps/web-portal`. Nguồn: Stitch project `projects/7952075426934119946` ("Image UI Replica Layout"), design system **Cyberpunk Neon Red HUD** (v1) + các màn hình desktop/mobile của project. KHÔNG dùng chung với `web-admin` (Dark SOC / Cyber-Threat). Thay thế bản "Nexus AI Royale — Royal Purple" cũ (còn trong lịch sử git).
>
> Khi design system và HTML màn hình khác nhau (font, bo góc) thì **theo design system**; màu, bố cục và hiệu ứng lấy từ màn hình.

---

# 1. Hướng thiết kế

HUD phân tích thuật toán kiểu cyberpunk: nền đen obsidian, ánh sáng đỏ neon (bloom) thay cho bóng đổ, nhãn kỹ thuật chữ in hoa giãn chữ, số liệu monospace.

- Chiều sâu = ánh sáng phát ra (viền đỏ + `box-shadow` bloom), không dùng bóng đổ mềm.
- Đỏ neon `#FF1E42` là tín hiệu chính (CTA, viền, đường biểu đồ). Vàng = tiền/số dư. Xanh lá = LIVE/tốt. Xám = offline/hòa.
- Không dùng: nền sáng, tím lavender (giao diện cũ), Font Awesome, font Orbitron/Montserrat/Inter/Segoe (có trong HTML mẫu nhưng KHÔNG thuộc design system).

# 2. Màn hình & route

| Route | Màn hình | Layout |
|---|---|---|
| `/login` | Đăng nhập / Đăng ký (trượt ngang trong một thẻ) | không shell; desktop 2 cột (thương hiệu + thẻ), mobile 1 cột |
| `/` | Trang chủ: hero, thẻ **lobby** (từ DB), dải thông báo | shell + sidebar |
| `/lobbies/[lobbyId]` | Trang lobby: hero, thẻ **category** | shell + sidebar |
| `/categories/[categoryId]` | Danh sách bàn LIVE: banner (LIVE + tên + Quay Lại Sảnh) + lưới thẻ bàn | shell, không sidebar |
| `/streams/[streamId]` | Chi tiết bàn: dự đoán, streamer + bảng hạt cầu, thống kê, biểu đồ, lịch sử | shell, không sidebar |

Thuật ngữ: Sảnh = `lobbies`; Loại game = `categories`; Bàn = `streams`; Phiên = `game_sessions`.
Sidebar: "Trang chủ", các lobby ACTIVE từ API, và các mục chưa có chức năng (Thống kê, VIP, Tin tức, CSKH) → `alert` "Coming soon". Mobile: sidebar thành thanh cuộn ngang.
Header: logo (tràn xuống dưới viền), lời chào (số điện thoại), số dư (từ `/auth/me`, chuỗi — không tính toán), NẠP TIỀN / chuông / hamburger → "Coming soon". Chọn ngôn ngữ nằm trong menu hamburger (chưa thiết kế) — component `LanguageSwitcher` vẫn giữ.

# 3. Token (xem `apps/web-portal/tailwind.config.ts`)

```text
Floor 0  void    #050507   nền (lưới chấm 24px rgba(255,30,66,.04))
Floor 1  panel   #0D0B10   header, panel; viền rgba(255,30,66,.2–.35)
Floor 2  module  #140D12   thẻ/khối chính; viền rgba(255,30,66,.4–.6)
Floor 3  neon    #FF1E42   viền đặc + bloom cho nút/modal
neon-soft #FF4D6D  neon-deep #B91C1C  neon-glow #FF0037
gold     #F59E0B / #FBBF24   số dư, tiền
ai       #10B981 / #34D399   LIVE, thắng
slate-hud #94A3B8            nhãn telemetry
bead     B #DC2626 · P #2563EB · T #16A34A
```

Bloom: `shadow-bloom` = `0 0 8px .8, 0 0 24px .4, 0 0 48px .2` của `rgba(255,30,66)`. Lớp thành phần: `.hud-card`, `.hud-card-glow`, `.neon-panel`, `.neon-border`, `.cyber-btn-red` (globals.css).

# 4. Typography (next/font)

| Vai trò | Font | Dùng cho |
|---|---|---|
| `font-display` | Space Grotesk | tiêu đề, nhãn nav, chữ B/P to — mặc định IN HOA |
| `font-mono` | JetBrains Mono | số liệu, ID phiên, nhãn kỹ thuật (letter-spacing .08–.12em), badge |
| `font-sans` (body) | Outfit | nội dung, mô tả |

Số luôn `tabular-nums` (đã đặt ở body) để không nhảy khi cập nhật realtime.

# 5. Thành phần

- **Nút**: `NeonButton`/`NeonLink` — primary (gradient `#FF1E42→#B91C1C`, hover scale 1.02 + bloom đôi) và ghost (viền đỏ 40%, nền đỏ 6%). Nút chưa có chức năng vẫn bấm được và hiện alert "Coming soon".
- **Huy hiệu kết nối** (`StatusBadge`): `live` xanh lá nhấp nháy · `offline` xám · `reconnecting` đỏ nhấp nháy ("MẤT KẾT NỐI").
- **Thẻ lobby/category**: `neon-panel`, ảnh vuông 56×56 theo slug tên (`SlugImage`, placeholder chữ cái đầu khi thiếu file), tên IN HOA, dòng phụ là số liệu thật ("N loại game" / "N bàn"), nút tròn mũi tên.
- **Thẻ bàn**: số/tên bàn lớn màu neon + badge LIVE, streamer, phiên, tỷ lệ win + chuỗi thắng (mock), 10 lượt gần nhất (✓/✕), nút "Chi Tiết AI Dự Đoán →".
- **Khung dự đoán** (chi tiết bàn) — 5 trạng thái:
  1. Offline: chữ OFFLINE.
  2. Chờ `IN_PROGRESS` của ván: radar + "ĐANG NẠP DỮ LIỆU...".
  3. Đang lấy dự đoán: radar + "ĐANG PHÂN TÍCH" / "ĐANG QUÉT DỮ LIỆU BÀN...".
  4. Có dự đoán: nhãn trạng thái ván, "DỰ ĐOÁN", chữ B/P to (trắng + glow), tỉ lệ tin cậy.
  5. Có kết quả: nền tô theo màu — thắng xanh lá, thua đỏ đậm, hòa xám — kèm nhãn THẮNG / THUA / HÒA. (Nền mặc định của giao diện đã là đỏ nên "thua" dùng nền đặc đậm hơn + nhãn.)
- **Bảng hạt cầu**: 6 hàng × 10 cột (60 ô, điền theo cột), B đỏ / P xanh dương / T xanh lá; hàng pill `B: n · P: n · T: n` bên dưới lấy từ `total_B/P/T` realtime. Phía trên: tên streamer (vàng) và cờ emoji theo quốc gia.
- **Lịch sử ván**: tiêu đề "Lịch sử ván", 10 ô (5×2) `Phiên shoe-round`, `dự đoán → kết quả`, nhãn THẮNG (xanh) / THUA (đỏ) / HÒA (xám).
- **Biểu đồ độ tin cậy**: đường `#FF1E42` 3px + drop-shadow đỏ, chấm trắng viền đỏ (dữ liệu giả lập).
- **Radar**: component `Radar` (SVG động).

# 6. Chuyển động

Mọi hiệu ứng tắt khi người dùng bật "giảm chuyển động" (`prefers-reduced-motion`). Dùng `animate-*` trong tailwind.config + `stagger()` (`src/lib/stagger.ts`).

| Hiệu ứng | Áp dụng | Thông số |
|---|---|---|
| `slide-in-left` | mục sidebar (trang chủ/lobby), cột trái chi tiết bàn | 0.6s, so le 60ms |
| `slide-in-right` | thẻ lobby/category, cột phải chi tiết bàn | 0.65s, so le 80ms |
| `banner-in` | hero banner | 0.8s |
| `card-in` | thẻ bàn ở danh sách | 0.65s, so le 100ms |
| `entrance-down` | thẻ đăng nhập | 0.85s |
| thoát khi bấm thẻ (`useExitNavigation`) | sidebar rút lên theo thứ tự ngược, thẻ trượt phải, banner trượt lên; sau 0.6s mới chuyển trang | |
| `notify-shake` | chip THÔNG BÁO | 4s lặp |
| `radar-*` | radar | quét 2.2s, vòng xung 3s |

# 7. Responsive

Theo class Tailwind của thiết kế: 12 cột ở `lg` (chi tiết bàn 5/7), lưới thẻ 1 → 2 → 3/4 cột, balance ẩn dưới `sm`. Mobile đăng nhập có bản riêng (logo trên, thẻ 4 góc khung, dòng SSL ở chân).

# 8. Ảnh

Trong `apps/web-portal/public/images/` (xem README ở đó): `logo.png`, `banner-home.png`, `hud-frame.png`, `pedestal-bg.png`; ảnh thẻ theo `lobbies/<slug>.png`, `categories/<slug>.png` (`slugify` ở `src/lib/slug.ts`).
