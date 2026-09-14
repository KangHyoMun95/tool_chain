---
description: Commit các thay đổi hiện tại, push lên branch mới, và tạo Pull Request trên GitHub
argument-hint: [mô tả ngắn cho branch/PR]
allowed-tools: Bash(git *), Bash(gh *)
---

Thực hiện đúng thứ tự sau, KHÔNG bỏ bước nào:

1. Chạy `git status` và `git diff` để xem các thay đổi hiện tại.
2. Nếu đang ở branch `main`/`master`, tạo branch mới từ tên gợi ý dựa trên nội dung
   thay đổi và mô tả sau đây: "$ARGUMENTS". Đặt tên branch dạng kebab-case,
   tiền tố theo loại thay đổi, ví dụ: `feat/admin-con-crud`, `fix/points-guard`.
   Nếu đã ở một feature branch rồi thì dùng branch hiện tại, không tạo branch mới.
3. `git add` các file liên quan tới thay đổi (không add file rác như node_modules,
   .env, file build).
4. Viết commit message theo Conventional Commits (feat/fix/chore/refactor/docs...),
   dòng đầu ngắn gọn mô tả đúng thay đổi, dựa trên diff thực tế — không copy
   nguyên văn "$ARGUMENTS".
5. `git push -u origin <tên-branch>`.
6. Tạo Pull Request bằng `gh pr create` với:
   - `--base main`
   - `--title` ngắn gọn khớp commit
   - `--body` tóm tắt: thay đổi gì, vì sao, có ảnh hưởng tới phần RBAC/migration
     nào không (dựa theo CLAUDE.md), và cách test đã làm (nếu có)
7. Sau khi tạo xong, in ra link PR để người dùng bấm vào review — KHÔNG tự merge.

Nếu có lỗi ở bất kỳ bước nào (vd conflict, chưa có remote, chưa auth `gh`),
dừng lại và báo rõ lỗi thay vì cố xử lý bằng lệnh phá hoại (không dùng
`git push --force`, không dùng `git reset --hard`).
