# Ảnh của web-portal

| File | Dùng ở | Ghi chú |
|---|---|---|
| `logo.png` | header, đăng nhập | logo TOOL HACK AI (nền trong suốt) |
| `banner-home.webp` | banner trang chủ / lobby | WebP 1800px (~60KB); bản PNG gốc 1.4MB gây giật khi chạy hiệu ứng |
| `hud-frame.png` | nền đăng nhập mobile | khung HUD neon đỏ |
| `pedestal-bg.png` | nền các khối của chi tiết bàn | `mix-blend-screen` |
| `lobbies/<slug>.png` | thẻ lobby, sidebar | ảnh 112×112 (hiển thị 56×56), PNG/WebP nền trong suốt |
| `categories/<slug>.png` | thẻ category | như trên |

`<slug>` = tên lobby/category bỏ dấu, chữ thường, ký tự lạ thành `-` (hàm `slugify` ở `src/lib/slug.ts`).
Ví dụ lobby "Casino" → `lobbies/casino.png`, category "Baccarat" → `categories/baccarat.png`.
Chưa có ảnh thì UI hiện ô placeholder (chữ cái đầu), không cần sửa code khi thêm ảnh.

## Còn thiếu (chưa lấy được từ Stitch, cần copy tay nếu muốn đúng thiết kế)
- `pedestal-base.png` (bệ đỡ chữ dự đoán, 339×29), `rice-left.png`, `rice-right.png` (hai cây lúa, 71×117)
- `mascot.png` (nhân vật hacker ở banner trang chủ), `login-bg.jpg` (nền đăng nhập desktop)
Các chỗ dùng chúng có dự phòng bằng CSS nên giao diện vẫn chạy khi thiếu file.
