// src/no-hu/lucky-time.controller.ts
// Lịch lucky time cho HOST (web-admin). ADMIN chưa có quyền.
import { BadRequestException, Controller, Get, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { LUCKY_TIME_MAX_FILE_BYTES } from "@toolhackchain/shared/lucky-time-file";
import { Roles } from "../auth/decorators.js";
import { LuckyTimeListQueryDto } from "./dto/lucky-time-list-query.dto.js";
import { LuckyTimeService } from "./lucky-time.service.js";

@Controller("lucky-time")
export class LuckyTimeController {
  constructor(private lucky: LuckyTimeService) {}

  /** Lịch đang hiệu lực (`replaced_at IS NULL`), có tên game. */
  @Get()
  @Roles("HOST")
  list(@Query() q: LuckyTimeListQueryDto) {
    return this.lucky.list(q.category_id);
  }

  /**
   * Import lịch từ file (multipart, field `file`, tối đa 5MB). Server tự đọc và kiểm tra lại toàn bộ file (không tin kết quả xem trước của
   * trình duyệt); còn dòng lỗi ⇒ 400 kèm `issues`, không ghi gì.
   */
  @Post("import")
  @Roles("HOST")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: LUCKY_TIME_MAX_FILE_BYTES, files: 1 } }))
  import(@UploadedFile() file: { buffer: Buffer } | undefined) {
    if (!file) throw new BadRequestException({ code: "FILE_REQUIRED", message: "Thiếu file (field `file`)" });
    return this.lucky.importFile(file.buffer);
  }
}
