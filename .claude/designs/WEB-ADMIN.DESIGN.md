# CYBERSENTINEL — AI SECURITY PLATFORM
## UI/UX Design Specification — Dark SOC / Cyber-Threat Intelligence Theme

> Mục tiêu: tài liệu này là design contract cho AI coding agent, được rút ra từ ảnh chụp màn hình Dashboard gốc. Toàn bộ website (Threat Intelligence, Vulnerability Scanner, AI Assistant, Compliance Reports, Asset Management, Settings...) phải giữ đúng một visual language: dark Security Operations Center (SOC), threat-intel console, AI-assisted cybersecurity platform.

---

# 1. Design Direction

Giao diện mang cảm giác của một **Security Operations Center (SOC) do AI vận hành**.

Tinh thần hình ảnh:

- Dark cybersecurity console
- Threat intelligence / SOC dashboard
- AI-assisted analysis (không phải AI thuần)
- Severity-driven color coding (đỏ/cam/vàng/xanh lá/cyan)
- Real-time monitoring feel
- Premium enterprise security product (kiểu CrowdStrike, Darktrace, SentinelOne) chứ không phải "hacker terminal"

Visual reference:

> "Một trung tâm điều hành an ninh mạng, nơi AI liên tục quét, phân loại và cảnh báo mức độ nghiêm trọng của từng mối đe dọa theo thời gian thực."

Không dùng:

- Matrix rain / green terminal cổ điển
- Skull, hacker mask
- Random hex chạy nền liên tục
- Gaming HUD / cyberpunk quá đà

---

# 2. Core Visual Keywords

- Threat / Threat Intelligence
- Vulnerability
- Severity (Critical / High / Medium / Low)
- Security Score
- AI Analysis
- Live Monitoring
- Protected Assets
- Compliance
- System Health
- Secure Channel
- Real-time

---

# 3. Color System

## Primary palette

```text
Background          #0A0E14
Sidebar / Top Bar    #0B0F16
Surface (card)       #111827
Surface Elevated     #161D2B
Border               #1F2937

Primary Cyan         #22D3EE
Secondary Pink       #EC4899

Text Primary         #F3F4F6
Text Secondary       #9CA3AF
Text Muted           #6B7280
```

## Severity / Status palette

Đây là hệ màu **quan trọng nhất** của sản phẩm — mọi mức độ nghiêm trọng và trạng thái hệ thống đều map vào 1 trong 5 màu sau, dùng nhất quán xuyên suốt app (border, icon, text, badge):

```text
Critical / Danger    #EF4444   (đỏ)
High / Warning       #F59E0B   (cam/vàng)
Medium / Info-Cyan   #22D3EE   (cyan — trùng primary)
Low / Neutral        #9CA3AF   (xám)
Success / Secure     #10B981   (xanh lá)
```

## Color usage

### Primary Cyan `#22D3EE`

Dùng cho:
- Logo / brand wordmark
- Active navigation item (border + glow + icon + text)
- Section title có ký hiệu "●" đứng trước (vd: "Live Threat Intelligence")
- Severity MEDIUM
- Trạng thái "AI đang phân tích..."
- Timestamp trong Recent Activity
- Focus state của input

Không phủ cyan lên diện tích lớn — chỉ dùng cho text, icon, border, glow mỏng.

### Secondary Pink `#EC4899`

Dùng rất tiết chế cho các yếu tố liên quan trực tiếp tới AI/trợ lý:
- Sparkle icon cạnh logo
- Nút "Chat with AI Assistant"

Không dùng pink cho dữ liệu bảo mật (threat/severity) — pink chỉ dành riêng cho ngữ cảnh "AI trợ lý", để tách biệt khỏi hệ màu severity.

### Success Green `#10B981`

Dùng cho:
- Security Score (số lớn) + icon shield
- Protected Assets (số lớn) + icon check
- Status badge: Active / Running / Up to date
- Trend indicator dương (mũi tên tăng, vd "+5 from last week")
- System Status dot ("● System Status: Operational")

### Warning `#F59E0B`

Dùng cho:
- Active Threats card (border + số + icon)
- Severity tag "HIGH"
- Status badge "Processing"

### Danger `#EF4444`

Dùng cho:
- Critical Vulnerabilities card (border + số + icon)
- Severity tag "CRITICAL"
- Icon cảnh báo mức nghiêm trọng nhất

### Text

```text
Primary    #F3F4F6   (giá trị số, tiêu đề item, tên hệ thống)
Secondary  #9CA3AF   (mô tả, phụ đề)
Muted      #6B7280   (label kỹ thuật, timestamp phụ, breadcrumb)
```

---

# 4. Typography

## Font families

```text
Display / Heading   Monospace kỹ thuật, dạng khối vuông
                     (vd: "Space Mono", "JetBrains Mono", "IBM Plex Mono")
Body / UI            Sans-serif hiện đại (Inter, Geist)
Technical / Data     Monospace (JetBrains Mono)
```

Điểm đặc trưng: **heading chính của trang ("Security Dashboard") dùng font monospace hiển thị**, khác với Web 01/Web 02 (dùng sans-serif cho heading). Đây là điểm nhận diện riêng của CyberSentinel — cảm giác "đọc dữ liệu hệ thống" ngay từ tiêu đề.

## Typography hierarchy

```text
Page title (mono)     30–34px, bold
Panel title            16–18px, semibold
Card title              13–14px, medium
Metric (số lớn)         28–34px, bold
Body                     13–14px
Secondary                12–13px
Technical / tag          10–12px, mono, uppercase, letter-spacing ~0.06em
Micro label               9–10px, uppercase
```

Severity tag ("CRITICAL", "HIGH", "MEDIUM") và status badge ("Active", "Running", "Processing") luôn:
- monospace hoặc uppercase sans nhẹ
- letter-spacing rộng
- màu theo đúng bảng severity ở mục 3

---

# 5. Global Background

Nền tối giản hơn Web 01/Web 02 — ít hiệu ứng trang trí hơn vì đây là **dashboard vận hành thật, ưu tiên đọc dữ liệu** hơn là atmosphere.

```text
Background base    #0A0E14  (gần như solid, không gradient rực)
```

Cho phép:
- Radial glow cyan rất nhẹ ở góc trên (tuỳ chọn, opacity ≤ 0.04)
- Không grid, không particle, không network graph nổi bật ở dashboard chính

→ Khác biệt chủ đích so với Web 01/02: CyberSentinel thiên về **data-density / operational clarity**, atmosphere chỉ là gia vị rất nhẹ, không phải điểm nhấn.

---

# 6. Application Shell

```text
┌────────────┬──────────────────────────────────────────────────────┐
│            │ TOP BAR (search · notification · user)                │
│  SIDEBAR   ├──────────────────────────────────────────────────────┤
│            │                                                       │
│  (fixed)   │                MAIN CONTENT                          │
│            │                                                       │
│            │                                                       │
└────────────┴──────────────────────────────────────────────────────┘
```

Sidebar chiếm chiều cao toàn màn hình (full-height, fixed), khác Web 01/02 là top bar không kéo dài full width phía trên sidebar — search bar nằm ngay trong top bar, bên phải sidebar.

---

# 7. Sidebar

Width: `260–280px`
Background: `#0B0F16` (đậm hơn main content 1 chút)
Border phải: `1px solid #1F2937`

Cấu trúc:

```text
◆ CyberSentinel                    ⇤ (collapse)
  AI Security Platform

  ○ Dashboard
  △ Threat Intelligence
  ▢ Vulnerability Scanner
  ◈ AI Assistant
  ▤ Compliance Reports
  ▥ Asset Management
  ⚙ Settings

  ──────────────────────────
  [CS]  CyberSentinel AI
        Security Status: Active
```

- Logo: icon shield trong khung bo góc, cyan; wordmark "CyberSentinel" cyan bold; sparkle icon nhỏ màu pink cạnh logo (biểu tượng AI); subtitle "AI Security Platform" muted nhỏ.
- Nav item mặc định: icon outline muted + label secondary, không nền, không border.
- Nav item active (Dashboard):
  ```text
  background: rgba(34,211,238,0.08)
  border: 1px solid rgba(34,211,238,0.35)
  border-radius: 10px
  box-shadow: 0 0 16px rgba(34,211,238,0.12)
  icon + text: #22D3EE
  ```
- Footer cố định cuối sidebar: avatar tròn gradient (cyan→pink) with initials, tên hệ thống + trạng thái nhỏ màu muted, tách khỏi nav bằng `border-top: 1px solid #1F2937`.

---

# 8. Top Bar

Height: `64–72px`
Background: cùng tông sidebar `#0B0F16`, `border-bottom: 1px solid #1F2937`

```text
[ ⚲  Search vulnerabilities, assets, or threats... ]     🔔³   Yacine Khaldi ◉
                                                                Security Admin
```

- Search input: full rounded (pill hoặc radius 10px), nền `#111827`, icon kính lúp muted bên trái, placeholder muted, chiếm phần lớn chiều rộng top bar bên trái/giữa.
- Notification: icon chuông outline, badge tròn đỏ nhỏ góc trên phải hiển thị số lượng (vd "3").
- User block: avatar tròn (ảnh hoặc gradient), tên `Text Primary` đậm, chức danh `Text Muted` nhỏ ngay dưới, canh phải.

---

# 9. Page Header

```text
Security Dashboard                              ● System Status: Operational
Real-time cybersecurity monitoring and threat intelligence
```

- Title: font mono, cỡ lớn (30–34px), màu cyan (đây là trang duy nhất tiêu đề dùng màu accent thay vì text primary — nhấn mạnh "đây là dashboard chính").
- Subtitle: text secondary, cỡ thường, không mono.
- Bên phải cùng hàng: trạng thái hệ thống tổng quát — dot xanh lá nhấp nháy nhẹ + label mono uppercase nhỏ, màu success.

---

# 10. Stat / Metric Cards

4 card ngang đầu trang, mỗi card đại diện 1 chỉ số, **border và icon đổi màu theo mức độ nghiêm trọng của chỉ số đó** — đây là pattern cốt lõi khác biệt với Web 01/02 (nơi mọi card đều border neutral).

```text
┌──────────────────────────┐
│ 🛡 Security Score          │   border: rgba(16,185,129,0.35)  (success)
│                           │
│ 87   ↗ +5 from last week  │
└──────────────────────────┘

┌──────────────────────────┐
│ ⚠ Active Threats           │   border: rgba(245,158,11,0.35)  (warning)
│                           │
│ 3                         │
│ Requires attention        │
└──────────────────────────┘

┌──────────────────────────┐
│ ⊗ Critical Vulnerabilities │   border: rgba(239,68,68,0.35)   (danger)
│                           │
│ 2                         │
│ Immediate action needed   │
└──────────────────────────┘

┌──────────────────────────┐
│ ✓ Protected Assets         │   border: rgba(16,185,129,0.35)  (success)
│                           │
│ 24                        │
│ All systems monitored     │
└──────────────────────────┘
```

Quy tắc:
- Nền card: `#111827`, radius `12–14px`.
- Border 1px, màu = màu ngữ nghĩa của chỉ số ở opacity ~0.3–0.4 (không dùng border trắng/neutral cho nhóm card này).
- Icon nhỏ đứng trước label, cùng màu với border.
- Số liệu lớn (28–34px) dùng đúng màu ngữ nghĩa (success card → số xanh lá, warning → số cam, danger → số đỏ).
- Dòng phụ dưới: text muted nhỏ, có thể kèm icon mũi tên xu hướng màu success nếu là tăng trưởng tích cực.

---

# 11. Panel / Section Card (khung chung)

Mọi khối nội dung lớn (Live Threat Intelligence, Quick Actions, System Health, Recent Activity...) dùng chung 1 khung:

```text
background:   #111827
border:       1px solid #1F2937
border-radius: 14px
padding:      20–24px
```

Tiêu đề panel:

```text
● Live Threat Intelligence                          View All →
```

- Dấu chấm tròn nhỏ trước tiêu đề (màu theo chủ đề panel: đỏ cho threat intel, cyan cho AI-related...).
- Tiêu đề: 16–18px, semibold, màu cyan hoặc text primary tuỳ panel.
- Action link phải ("View All →"): text muted nhỏ, hover sang cyan.

---

# 12. Severity List Item (Threat Intelligence pattern)

Đây là component quan trọng thứ 2 sau Stat Card — dùng cho danh sách threat/event có mức độ nghiêm trọng.

```text
┌───────────────────────────────────────────────────────────┐
│ ⚡ New Ransomware Campaign Detected            CRITICAL     │
│    LockBit 3.0 variant targeting healthcare systems         │
│    🕐 2 minutes ago   📍 Worldwide          Global Threat Intel │
└───────────────────────────────────────────────────────────┘
```

Quy tắc:
- Border trái/toàn viền nhuốm màu severity ở opacity thấp (~0.25–0.35), nền hơi tối hơn panel nền `#0D1420`–`#161014` tuỳ tông severity.
- Icon đầu dòng đổi theo severity: `⚡` critical, `▲` high, `◎`/mắt medium, `▲` (nhạt hơn) low.
- Title: text primary, semibold.
- Severity tag: góc phải trên cùng, uppercase mono nhỏ, màu = màu severity (`CRITICAL` đỏ, `HIGH` cam, `MEDIUM` cyan).
- Mô tả: text secondary, 1 dòng.
- Meta row: cụm icon-đồng hồ + "x phút/giờ trước", icon-pin + khu vực — cả hai `text muted`, mono nhỏ.
- Nguồn tin (vd "Global Threat Intel", "CVE Database", "CyberSentinel AI"): căn phải, màu cyan, mono nhỏ.

## Bảng mapping severity → màu/icon

```text
CRITICAL   #EF4444   ⚡ (lightning / alert-octagon)
HIGH       #F59E0B   ▲ (triangle-alert)
MEDIUM     #22D3EE   ◎ (eye)
LOW        #9CA3AF   ▲ (triangle nhạt)
```

## AI processing indicator (cuối danh sách)

```text
┌ - - - - - - - - - - - - - - - - - - - - - - - - - - - - -┐
   ● AI analyzing 1,247 new threat indicators... ●
└ - - - - - - - - - - - - - - - - - - - - - - - - - - - - -┘
```

- Khung border nét đứt (dashed), radius lớn (pill hoặc 12px), màu cyan mờ.
- Text mono, cyan, canh giữa.
- Hai dấu chấm 2 đầu nhấp nháy nhẹ (opacity 1 → 0.4 → 1, ~2s).

---

# 13. Quick Action Buttons

Danh sách nút hành động nhanh, xếp dọc, mỗi nút có màu chủ đề riêng thể hiện qua **glow border**, không phải fill đặc:

```text
[ ▣ Run Vulnerability Scan ]     cyan glow   (primary action)
[ ◈ Chat with AI Assistant ]     pink glow   (AI action)
[ ▤ Generate Compliance Report ] green glow  (success/neutral action)
```

Style dùng chung:

```text
background:   rgba(255,255,255,0.02)
border:       1px solid <theme-color @ 0.4 opacity>
border-radius: 10px
box-shadow:   0 0 18px <theme-color @ 0.12 opacity>   (chỉ ở nút đầu tiên/nổi bật nhất, các nút khác nhạt hơn)
text/icon:    theme-color
height:       44–48px
```

Icon căn trái, text căn trái (không uppercase toàn bộ như Web 01/02 — CyberSentinel dùng câu chữ tự nhiên "Run Vulnerability Scan" thay vì "INITIALIZE OPERATION").

---

# 14. Key-Value Status List (System Health pattern)

```text
Monitoring          [ Active ]
Threat Detection    [ Running ]
AI Analysis         [ Processing ]
Compliance          [ Up to date ]
```

- Label bên trái: text secondary, cỡ thường.
- Giá trị bên phải: badge pill nhỏ, nền `<status-color @ 0.12>`, chữ `<status-color>`, mono nhỏ, uppercase hoặc capitalize tuỳ độ dài từ.
- Màu badge theo ngữ nghĩa: Active/Running/Up to date → success green; Processing → warning amber; (nếu có) lỗi → danger red.

---

# 15. Recent Activity Feed

```text
14:32   Vulnerability scan completed
        api.company.com

14:15   New threat detected
        ...
```

- Timestamp: mono, cyan, căn trái, cỡ nhỏ (11–12px).
- Event chính: text primary, cỡ thường.
- Chi tiết phụ (domain, id...): text muted, nhỏ hơn, dòng dưới.
- Không có border phân cách quá rõ — dùng spacing dọc + `border-bottom: 1px solid rgba(255,255,255,0.04)` rất mờ, hoặc chỉ spacing thuần.

---

# 16. Borders, Radius & Shadow

```text
Border default        1px solid #1F2937
Border theo severity   1px solid <color @ 0.3–0.4>
Border radius card     12–14px
Border radius button    8–10px
Border radius badge     full pill (999px)
```

Shadow:

```text
Card mặc định      0 8px 24px rgba(0,0,0,0.35)
Glow theo màu       0 0 16–20px <color @ 0.10–0.15>
```

Không dùng shadow xám generic kiểu SaaS trắng (`rgba(0,0,0,0.1)` đồng nhất mọi nơi) — mỗi glow phải mang màu ngữ nghĩa của phần tử.

---

# 17. Buttons (tổng quát)

```text
Primary (cyan)     border + text cyan, nền gần như trong suốt, glow nhẹ khi hover
AI (pink)          border + text pink, dùng riêng cho hành động liên quan AI Assistant
Success (green)    border + text green, dùng cho hành động tạo báo cáo/xuất dữ liệu
Danger             chỉ dùng cho hành động huỷ/xoá thật sự nguy hiểm — không dùng cho severity display
```

Không dùng nút fill đặc màu neon lớn — tất cả nút chính trong dashboard này theo phong cách **outline + glow**, khác với Web 01 (fill cyan đặc cho CTA).

---

# 18. Forms / Search

```text
background:   #111827
border:       1px solid #1F2937
radius:       10px (hoặc pill cho thanh search top bar)
focus:        border-color #22D3EE; box-shadow 0 0 0 2px rgba(34,211,238,0.12)
placeholder:  #6B7280
```

---

# 19. Iconography

- Line icon 1.5–2px stroke, tối giản, outline (không fill).
- Icon trung tính: `#6B7280`/`#9CA3AF`.
- Icon mang ngữ nghĩa (severity, status, category) luôn nhuộm đúng màu tương ứng — không có icon "trang trí" vô nghĩa.
- Icon set gợi ý: shield, triangle-alert, scan/crosshair (vulnerability scanner), bot/sparkles (AI assistant), file-check (compliance), layers/server (asset management), gear (settings), search, bell, clock, map-pin, chevron.

---

# 20. Motion

```text
Status dot pulse        opacity 1 → 0.45 → 1, 1.8–2.2s
AI processing pill       dot pulse 2 đầu, ~2s, không nhấp nháy nhanh
Hover (card/button)      150–200ms, border-color + shadow transition
Số liệu cập nhật          fade/count-up ngắn, không giật
```

Không dùng hiệu ứng nền chuyển động mạnh — vì đây là dashboard vận hành, ưu tiên **ổn định thị giác** để đọc số liệu chính xác, chuyển động chỉ xuất hiện ở các chi tiết trạng thái nhỏ (dot, pill).

---

# 21. Responsive

- Desktop-first, sidebar cố định.
- Tablet: sidebar có thể thu gọn còn icon-only (nút `⇤` ở top sidebar đã gợi ý sẵn khả năng collapse).
- Mobile: sidebar chuyển thành drawer; 4 stat card xếp 1 cột hoặc 2 cột; layout 2 cột chính (Threat Intel / Quick Actions+System Health+Activity) xếp chồng thành 1 cột, panel bên phải xuống dưới panel trái.

---

# 22. Component Naming Direction

```text
AppShell
TopBar
Sidebar
SidebarNavItem
UserFooter

PageHeader
SystemStatusBadge

StatCard              (severity-tinted metric card)
Panel                 (khung section chung)
SeverityListItem      (threat/vulnerability item)
SeverityTag           (CRITICAL/HIGH/MEDIUM/LOW)
AIProcessingPill

QuickActionButton     (glow theo theme màu)
StatusBadge           (Active/Running/Processing/Up to date)
ActivityFeedItem
```

---

# 23. Implementation Principle

Khi dựng thêm màn hình mới (Threat Intelligence, Vulnerability Scanner, AI Assistant, Compliance Reports, Asset Management, Settings), AI coding agent **không được phát minh style mới**, phải kế thừa:

- Cùng AppShell (Sidebar + Top Bar)
- Cùng bảng màu severity (mục 3) cho mọi nơi hiển thị mức độ nghiêm trọng, dù ở Vulnerability Scanner hay Compliance Reports
- Cùng Panel style, StatCard style, SeverityTag, StatusBadge
- Cùng typography (heading trang chính = mono, còn lại sans-serif)
- Cùng nguyên tắc: pink chỉ dành cho AI Assistant, không lẫn vào severity

Chỉ nội dung/information architecture thay đổi giữa các màn hình, style hệ thống giữ nguyên 100%.