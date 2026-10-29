# NEXUS AI ROYALE — ROYAL PURPLE ANALYTICS
## UI/UX Design Specification — web-portal (cổng cho User)

> Design contract riêng của `apps/web-portal`, rút ra từ Stitch project `projects/10681042779717465733` (màn "NEXUS AI - Royal Purple Analytics"). KHÔNG dùng chung với `web-admin` (Dark SOC / Cyber-Threat). Mọi màn hình portal phải giữ đúng một visual language: **nền sáng tím lavender + header tím hoàng gia + điểm nhấn vàng amber**, bo góc lớn, card kính mờ.
>
> File này thay thế bản "Deep-Violet AI Console / FOSSOME Neural Network HUD" trước đó (nền tím-đen, hai cực tím↔xanh dương). Bản cũ còn trong lịch sử git.

---

# 1. Design Direction

Giao diện là **bảng phân tích thuật toán dự đoán AI cao cấp, tông "hoàng gia"** — sáng, sang, dễ đọc, thân thiện với người dùng cuối (khác tinh thần console tối của admin).

- Nền sáng lavender, header tím đậm đổ bóng, vàng amber là màu hành động/nhấn.
- Card bo rất tròn (24px), kính mờ, viền tím nhạt dày 2px.
- Số liệu lớn, font tiêu đề hình học (Outfit), nhãn UPPERCASE nhỏ.
- Phản hồi thắng/thua rõ ràng bằng màu ngữ nghĩa (xanh lá / hồng đỏ) và hiệu ứng flash ngắn.

Không dùng:
- Nền tối toàn trang, neon xanh lá kiểu Matrix, hacker terminal
- Monospace làm điểm nhấn (xem mục Typography)
- Bảng severity kiểu SOC (Critical/High/Medium/Low) của web-admin
- Hex màu hardcode rải rác — dùng token tập trung (mục 3)

---

# 2. Luồng màn hình (map với data model)

Portal chỉ có 3 view, đi theo phân cấp dữ liệu `lobbies → categories → streams`:

```text
1. SẢNH & LOẠI TRÒ CHƠI   lobbies (cột trái)  +  categories của sảnh đang chọn (cột phải)
2. DANH SÁCH BÀN LIVE      streams của category (grid card tối)
3. CHI TIẾT AI DỰ ĐOÁN     predictions của 1 stream: dự đoán realtime + lịch sử + biểu đồ độ tin cậy
```

| Thuật ngữ UI | Thực thể |
|---|---|
| Sảnh | `lobbies` |
| Loại trò chơi | `categories` |
| Bàn LIVE | `streams` |
| Phiên | `game_sessions` |
| Dự đoán | `predictions` (`predict_result`, `confidence_score`) |

Điều hướng bằng nút "Quay Lại Sảnh" / "Quay Lại Bàn LIVE" ở header (chỉ hiện từ view 2 trở đi). Không có sidebar.

---

# 3. Color System

Định nghĩa token tập trung (CSS variables / Tailwind theme), không hardcode hex trong component.

## Nền & text

```text
Background (gradient 135°)   #F3E8FF → #E9D5FF (50%) → #F5D0FE
Text chính                    #1E1B4B   (indigo rất đậm)
Text tiêu đề trên nền sáng    #3B0764 (purple-950)
Text phụ trên nền sáng        #6B21A8 / #7E22CE (purple-700/800)
Text phụ trên nền tối         #E9D5FF (purple-200) / #D8B4FE (purple-300)
```

## Tím hoàng gia (thương hiệu)

```text
Header gradient 90°   #581C87 → #7E22CE (50%) → #6B21A8
Purple 900            #581C87   badge nền tối, chip
Purple 700            #7E22CE   đường biểu đồ, spinner, viền focus
Purple 500            #A855F7   cuối gradient chữ tím
Viền card kính        rgba(192,132,252,0.5)   (#C084FC)
Card tối (gradient 180°)  #3B0764 → #1E1B4B
```

## Vàng amber (hành động & nhấn)

```text
Amber 500   #F59E0B   nút chính, viền card tối, sảnh đang chọn, điểm trên biểu đồ
Amber 400   #FBBF24   hover, chữ vàng trên nền tối
Amber 600   #D97706   số liệu nhấn trên nền sáng (chuỗi thắng, countdown)
Chữ trên nền vàng     #3B0764 (purple-950)
```

## Ngữ nghĩa thắng / thua (dùng nhất quán)

```text
Thắng / chính xác / LIVE   Emerald  #10B981 (nền nhạt #DCFCE7 / #D1FAE5, viền #22C55E, chữ #064E3B)
Thua / sai                  Rose     #F43F5E (nền nhạt #FFE4E6, viền #FDA4AF, chữ #881337)
```

Quy tắc:
- Xanh lá = đúng/thắng/đang LIVE; hồng đỏ = sai/thua. Chỉ dùng cho kết quả dự đoán, chip lịch sử, dot LIVE và flash feedback — không dùng để trang trí.
- Vàng amber là **màu hành động duy nhất** (CTA, trạng thái chọn). Không dùng amber cho trạng thái thắng/thua.
- Trên nền tối (card tối), số liệu thắng dùng emerald-400, số nhấn dùng amber-400.

---

# 4. Typography

```text
Heading / Số liệu lớn   Outfit (400–800), extrabold, tracking-tight
Body / Label / Nút       Plus Jakarta Sans (400–800), thường dùng weight 700–800 cho label
```

Toàn bộ sans-serif; **không dùng monospace**. Dùng tabular numerals cho số liệu, tỷ lệ %, countdown.

```text
Wordmark          Outfit 30px extrabold, gradient vàng #F59E0B → #FBBF24
Tiêu đề trang     Outfit 24px extrabold (text-purple-950)
Tiêu đề section   Outfit 18px extrabold
Số liệu lớn       Outfit 24–36px extrabold
Kết quả dự đoán   Outfit 36px extrabold, UPPERCASE
Label nhỏ         12px extrabold; micro-label 10–11px UPPERCASE
Badge / chip      12px extrabold; trạng thái "REAL-TIME AI ANALYSIS" tracking rộng
Tiêu đề trạng thái phân tích   12px extrabold UPPERCASE, tracking-widest
```

Chữ gradient dùng cho: wordmark (vàng), tiêu đề nhấn (tím `#6B21A8 → #A855F7`).

---

# 5. Global Background & Layout

- Nền: gradient lavender cố định (mục 3), `min-height: 100vh`, `overflow-x: hidden`.
- Không particle, không dot-grid, không glow nền.
- Container: `max-width: 80rem (max-w-7xl)`, căn giữa, padding trang `16px` mobile / `32px` desktop.
- Lưới: 12 cột; view 1 chia 4/8, view 3 chia 5/7; grid card bàn 1 → 2 → 3 cột (mobile → md → lg).
- Khoảng cách: giữa card `20–32px`; trong card `20–32px`.

---

# 6. Header ("Top bar hoàng gia")

```text
[👑]  NEXUS AI ROYALE                                  [← Quay Lại Sảnh]
      Hệ thống phân tích thuật toán chuyên nghiệp
```

- Nền gradient tím hoàng gia, bo `24px`, padding `16–20px`, bóng `0 8px 25px -5px rgba(88,28,135,0.4)`, chữ trắng.
- Logo: ô vuông bo `16px` 48×48, nền amber-500, icon vương miện (lucide `crown`) màu purple-950, bóng amber.
- Wordmark: gradient vàng; tagline `12px` purple-200 extrabold.
- Nút điều hướng (ẩn ở view 1): nền amber-500, chữ purple-950, bo `16px`, icon `arrow-left`, hover amber-400.

---

# 7. Banner thông báo hệ thống

Thanh mảnh đầu view 1: nền `purple-900/10`, viền purple-300, bo `16px`, chữ purple-950 bold 12px UPPERCASE, kèm ô icon `zap` nền amber-500.
Ví dụ: `HỆ THỐNG MÁY HỌC - CẬP NHẬT CHU KỲ DỰ ĐOÁN REAL-TIME DƯỚI 3 GIÂY`.

---

# 8. Card

## 8.1 Card kính (`purple-glass-card`) — nền sáng

```text
background:      rgba(255,255,255,0.88)
backdrop-filter: blur(16px)
border:          2px solid rgba(192,132,252,0.5)
box-shadow:      0 10px 30px -5px rgba(126,34,206,0.15)
border-radius:   24px (card lớn) / 16px (card chỉ số nhỏ)
padding:         20–32px
```

Dùng cho: item Sảnh, header view, khung dự đoán, chỉ số, biểu đồ, lịch sử.

## 8.2 Card tối (`purple-dark-card`) — nổi bật dữ liệu

```text
background:    linear-gradient(180deg, #3B0764, #1E1B4B)
border:        1.5px solid #F59E0B
box-shadow:    0 8px 20px rgba(59,7,100,0.3)
border-radius: 24px,  chữ trắng
```

Dùng cho: card Loại trò chơi, card Bàn LIVE. Tiêu đề card màu amber-400.

## 8.3 Hover

```text
hover: border-color #FBBF24, box-shadow 0 12px 30px rgba(245,158,11,0.4), translateY(-4px)
transition: 300ms
```

## 8.4 Trạng thái đang chọn (`active-lobby`)

Nền gradient `#581C87 → #6B21A8`, viền amber-500, chữ trắng, bóng amber `0 10px 25px rgba(245,158,11,0.35)`.

---

# 9. Thành phần theo view

## 9.1 View 1 — Sảnh & Loại trò chơi

- Cột trái (4/12): tiêu đề "1. Chọn Sảnh Phân Tích" + badge đếm `bg-purple-900 text-amber-400` pill. Mỗi sảnh là card kính: ô chữ cái 44×44 bo `16px` (đang chọn: nền amber; còn lại: nền purple-700/900 chữ amber), tên sảnh (Outfit 18px), mô tả 12px, chip số bàn bên phải.
- Cột phải (8/12): tiêu đề "2. Loại Trò Chơi (Sảnh …)" + gợi ý 12px; grid card tối 2 cột. Mỗi card: tên (amber-400), "N Bàn LIVE Active" (purple-200), nhãn "TỶ LỆ WIN AI" + số lớn amber-400, nút "Bàn Live →".

## 9.2 View 2 — Danh sách Bàn LIVE

- Header view: card kính, tiêu đề category + mô tả, badge `N BÀN LIVE` (`bg-purple-900 text-amber-400`, pill).
- Card bàn (tối): tên bàn (amber-400) + mã phiên; chip **LIVE** (emerald, nền `emerald-500/20`, viền `emerald-500/40`, dot `animate-ping`); khối 2 ô "TỶ LỆ WIN AI" (emerald-400) / "CHUỖI THẮNG" (amber-400) nền `black/40` bo `16px`; hàng **10 lượt gần nhất** (ô 28×28 bo `12px`, ✓ emerald-500 / ✕ rose-500); nút "Chi Tiết AI Dự Đoán →" gradient amber-500→amber-600.

## 9.3 View 3 — Chi tiết AI dự đoán

- Header: chip `REAL-TIME AI ANALYSIS`, tên bàn, mô tả, mã phiên đang quét bên phải (Outfit 20px).
- Cột trái (5/12): **khung dự đoán realtime** + 2 ô chỉ số ("Tỷ lệ win hiện tại", "Chuỗi thắng LIVE").
- Cột phải (7/12): biểu đồ độ tin cậy + lịch sử.

### Khung dự đoán — 3 trạng thái (chỉ hiện 1 tại một thời điểm)

1. **Analyzing**: spinner 2 vòng (viền purple-700 xoay + viền amber nét đứt xoay ngược, icon `cpu` pulse), dòng "THUẬT TOÁN ĐANG PHÂN TÍCH…", thanh tiến trình gradient purple-700→amber-500 có scanner chạy.
2. **Result**: chip "DỰ ĐOÁN LƯỢT MỚI", kết quả dự đoán (Outfit 36px UPPERCASE), "Tỷ lệ tin cậy: X%", ngăn cách bằng `border-t`, countdown "Chờ kết quả phiên" (Outfit 30px, amber-600).
3. **Flash feedback** (~1.2s): icon tròn 64px (✓ emerald-600 / ✕ rose-600), tiêu đề (emerald-900 / rose-900), phụ đề; card đổi nền + viền + glow theo `flashWin` / `flashLoss`, sau đó quay lại trạng thái 1.

> Trạng thái hiển thị phải dựa trên event từ server (SSE). Dữ liệu trong bản mockup Stitch (ngẫu nhiên, đếm ngược giả, tỷ lệ cứng) chỉ minh hoạ — không copy vào code. `predict_result` chỉ hiện cho user đã bị trừ điểm (xem quy tắc trong `CLAUDE.md`), lọc ở server chứ không ẩn ở client.

### Biểu đồ độ tin cậy (line, 10 phiên gần nhất)

- Đường `#7E22CE` dày 3px, `tension 0.4`, fill `rgba(126,34,206,0.12)`, điểm amber-500 bán kính 5.
- Trục Y `60–100`, tick `#581C87` bold; trục X không có grid; grid ngang `rgba(192,132,252,0.3)`.
- Ô chứa biểu đồ cao ~`224px` (`h-56`), kèm chip "10 Phiên Gần Nhất" (`bg-amber-400 text-amber-950`).
- Lưu ý: mockup Stitch có giá trị grid màu sai cú pháp (`'… | #E9D5FF'`) — khi code dùng một giá trị hợp lệ.

### Lịch sử 10 lượt

Lưới 2 → 5 cột. Mỗi ô bo `16px`, căn giữa: mã phiên (10px), kết quả dự đoán (12px extrabold), badge pill `✓ CHÍNH XÁC` (nền emerald-600) hoặc `✕ SAI` (nền rose-600), nền ô emerald-100 / rose-100 và viền tương ứng.

---

# 10. Thành phần dùng chung

| Thành phần | Quy tắc |
|---|---|
| Nút chính | Nền amber-500 (hoặc gradient amber-500→600), chữ purple-950, extrabold, bo `12–16px`, bóng nhẹ, hover amber-400 |
| Chip / Badge | Pill; nền tối: `bg-purple-900 text-amber-400`; nền vàng: `bg-amber-400 text-amber-950`; trạng thái: nền màu 20% + viền 40% |
| Ô chữ cái / icon | Vuông bo `16px`, 44–48px; nền amber hoặc tím đậm |
| Progress bar | Track `purple-100`, cao 8px, pill; fill gradient purple-700→amber-500 |
| Icon | `lucide` — `crown`, `zap`, `cpu`, `arrow-left` |
| Radius | Card `24px`, ô chỉ số `16px`, nút `12–16px`, chip/pill `9999px` |

---

# 11. Motion

```text
Hover card          300ms, nâng 4px + viền/bóng amber
LIVE dot            animate-ping
Spinner phân tích   vòng ngoài 1s/vòng, vòng amber nét đứt 4s/vòng ngược chiều
Scanner thanh tiến trình   1.5s linear, lặp
Flash win / loss    1.2s ease-in-out, 1 lần (đổi nền + viền + glow xanh lá / hồng đỏ)
Chuyển trạng thái khung dự đoán   500ms
```

Giữ chuyển động ngắn, có mục đích (báo trạng thái); tôn trọng `prefers-reduced-motion` (tắt ping, scanner, spinner nhanh, flash).

---

# 12. Responsive

- Mobile-first: 1 cột; header wrap, nút điều hướng xuống dòng.
- `md`: grid card 2 cột. `lg`: layout 12 cột (4/8, 5/7), grid bàn 3 cột.
- Lịch sử 10 lượt: 2 cột mobile, 5 cột từ `sm`.
- Padding trang `16px` (mobile) → `32px` (md).

---

# 13. Component Naming Direction

```text
RoyalHeader
SystemBanner
LobbyCard           (view 1, cột trái)
GameCategoryCard    (view 1, cột phải — card tối)
StreamCard          (view 2 — card tối bàn LIVE)
RecentResultDots    (hàng 10 lượt ✓/✕)
PredictionPanel     (3 trạng thái: Analyzing / Result / Flash)
StatTile            (ô chỉ số nhỏ)
ConfidenceChart
HistoryTile
```

---

# 14. Implementation Principle

- Mọi màn mới kế thừa: nền lavender, header hoàng gia, hai loại card (kính / tối), vàng amber làm màu hành động.
- Token màu và font đặt tập trung (theme/Tailwind config/CSS variables), không rải hex.
- Xanh lá / hồng đỏ chỉ cho kết quả đúng–sai và trạng thái LIVE.
- Mockup Stitch dùng Tailwind CDN, `lucide@latest`, Chart.js CDN và dữ liệu giả — chỉ làm tham chiếu thị giác; khi triển khai trong Next.js dùng dependency được pin trong `package.json` và dữ liệu thật từ API/SSE.
- Portal chỉ hiển thị: không tính tiền, không lọc quyền ở client.
