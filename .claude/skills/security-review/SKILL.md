---
name: security-review
description: Dùng skill này khi review một Pull Request của ToolHackChain. Review không chỉ diff của PR mà đối chiếu với toàn bộ quy ước trong CLAUDE.md, và luôn kiểm tra một checklist bảo mật cố định — không chỉ tính năng vừa thêm.
---

# Quy trình review PR cho ToolHackChain

## Bước 0 — Kiểm tra các comment đã có trước đó (bắt buộc, làm ĐẦU TIÊN)

1. Lấy toàn bộ comment/inline-comment đã có trên PR bằng:
   ```
   gh api repos/{owner}/{repo}/pulls/{number}/comments --paginate
   gh api repos/{owner}/{repo}/issues/{number}/comments --paginate
   ```
2. Lọc ra các comment do chính Claude đã đăng ở lần review trước (nhận diện qua nhãn
   "🔴 Security" hoặc marker ẩn dạng `<!-- claude-review: <file>:<line>:<mã-vấn-đề-ngắn> -->`
   mà bạn tự chèn khi comment).
3. Ghi nhớ danh sách vấn đề đã từng được nêu (file, dòng, mô tả ngắn) — đây là "đã flag rồi".
4. Nếu biến môi trường `PR_BASE_SHA` và `PR_HEAD_SHA` được cung cấp trong prompt, chỉ tập
   trung phân tích phần thay đổi MỚI bằng `git diff $PR_BASE_SHA $PR_HEAD_SHA`, thay vì đọc
   lại toàn bộ diff của PR từ đầu. Checklist bảo mật ở Bước 2 vẫn áp dụng cho phần code mới
   này và phần code liên quan trực tiếp tới nó (không phải toàn bộ PR).

## Bước 1 — Nạp context trước khi review

1. Đọc `CLAUDE.md` ở gốc repo để nắm lại: mô hình phân quyền 3 tầng, quy ước NestJS/TypeORM/Next.js.
2. Nếu PR đụng tới backend (`apps/api`), đọc thêm `.claude/skills/rbac-guard/SKILL.md` và
   `.claude/skills/typeorm-migration/SKILL.md` để áp dụng đúng luật.
3. Nếu PR đụng tới frontend (`apps/web`), đọc thêm `.claude/skills/nextjs-frontend/SKILL.md`.
4. Đọc thêm các file liên quan tới phần code mới (không chỉ dòng thay đổi) để hiểu code xung
   quanh có bị ảnh hưởng không. Ví dụ: PR sửa 1 service, phải đọc luôn controller + guard gọi
   tới service đó, không chỉ đọc phần diff hiển thị.

## Bước 2 — Checklist bảo mật cố định (áp dụng cho MỌI PR, không chỉ phần vừa sửa)

Luôn kiểm tra các mục sau, kể cả khi PR không "trông giống" liên quan tới bảo mật:

**Auth & phân quyền**
- Route mới có `@Roles()` guard chưa? Guard có đúng role không?
- Query có scope đúng theo cấp trên không (Admin Con A không đụng được dữ liệu Admin Con B)?
- JWT: có kiểm tra hết hạn, có verify signature đúng cách không, secret có bị hardcode không?

**Input & injection**
- Input từ client có qua `class-validator`/DTO chưa, hay dùng thẳng `req.body`?
- Có đoạn TypeORM nào dùng raw query nối chuỗi (`query(\`...${x}...\`)`) thay vì parameterized không?
- Next.js: có render trực tiếp input người dùng vào HTML (nguy cơ XSS) không?

**Secrets & cấu hình**
- Có API key, connection string, JWT secret nào bị hardcode trong code (không qua biến môi trường) không?
- File `.env`/secret có vô tình bị thêm vào commit không?

**Business logic nhạy cảm (đặc thù ToolHackChain)**
- Thao tác cấp/trừ điểm có đi qua `PointsService` + ghi `PointTransaction` không, hay cộng/trừ field trực tiếp?
- Homepage Config: chỉ Host được ghi — endpoint ghi config có bị lộ cho Admin Con/User không?

**Migration (nếu PR có thay đổi entity/migration)**
- Có sửa tay migration cũ không (phải luôn là migration mới)?
- Migration có `down()` hợp lệ không?

## Bước 3 — Định dạng output

- **Không đăng lại** vấn đề đã có trong danh sách "đã flag rồi" ở Bước 0, trừ khi phần code
  liên quan đã đổi khác hẳn (nếu vậy, coi là vấn đề mới, note rõ "cập nhật từ lần review trước").
- Với mỗi vấn đề MỚI: đăng inline comment trỏ đúng dòng, và luôn chèn marker ẩn ở cuối comment
  dạng `<!-- claude-review: <file>:<line>:<mô-tả-ngắn-không-dấu> -->` để lần review sau nhận diện được.
- Nếu phát hiện lỗ hổng bảo mật nghiêm trọng MỚI (leak dữ liệu chéo, thiếu auth guard, secret
  bị lộ), luôn có 1 comment tổng hợp gắn nhãn "🔴 Security" liệt kê rõ.
- Luôn kết thúc bằng 1 comment tổng hợp ngắn dạng "Đã review commit mới nhất (từ `$PR_BASE_SHA`
  đến `$PR_HEAD_SHA`). X vấn đề mới, Y vấn đề từ lần trước vẫn chưa fix, Z vấn đề đã fix."
  — để người review nắm được trạng thái tổng quan mà không cần đọc lại từ đầu.
- Nếu một vấn đề đã flag trước đó nay không còn thấy trong code (đã fix), ghi nhận rõ trong
  comment tổng hợp là đã fix, không cần đăng comment mới cho nó.
