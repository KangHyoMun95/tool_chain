---
name: security-review
description: Dùng skill này khi review một Pull Request của ToolHackChain. Review không chỉ diff của PR mà đối chiếu với toàn bộ quy ước trong CLAUDE.md, và luôn kiểm tra một checklist bảo mật cố định — không chỉ tính năng vừa thêm.
---

# Quy trình review PR cho ToolHackChain

## Bước 1 — Nạp context trước khi review (bắt buộc, làm trước khi đọc diff)

1. Đọc `CLAUDE.md` ở gốc repo để nắm lại: mô hình phân quyền 3 tầng, quy ước NestJS/TypeORM/Next.js.
2. Nếu PR đụng tới backend (`apps/api`), đọc thêm `.claude/skills/rbac-guard/SKILL.md` và
   `.claude/skills/typeorm-migration/SKILL.md` để áp dụng đúng luật.
3. Nếu PR đụng tới frontend (`apps/web`), đọc thêm `.claude/skills/nextjs-frontend/SKILL.md`.
4. Dùng `gh pr diff` để lấy diff, nhưng đừng chỉ dừng ở diff — dùng `gh pr view` và đọc thêm
   các file liên quan (không chỉ dòng thay đổi) để hiểu code xung quanh có bị ảnh hưởng không.
   Ví dụ: PR sửa 1 service, phải đọc luôn controller + guard gọi tới service đó, không chỉ đọc
   phần diff hiển thị.

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

- Dùng inline comment cho từng vấn đề cụ thể, trỏ đúng dòng.
- Nếu phát hiện lỗ hổng bảo mật nghiêm trọng (leak dữ liệu chéo, thiếu auth guard, secret bị lộ),
  luôn có 1 comment tổng hợp ở đầu PR gắn nhãn "🔴 Security" liệt kê rõ, kể cả khi chúng nằm
  ngoài phạm vi diff của PR này.
- Nếu không phát hiện vấn đề gì ở checklist bảo mật, vẫn ghi rõ trong comment tổng hợp là đã
  kiểm tra qua checklist này và không thấy vấn đề — để người review biết bước đó đã được làm.
