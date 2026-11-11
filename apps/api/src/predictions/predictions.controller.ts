// src/predictions/predictions.controller.ts
import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators.js";
import type { AuthUser } from "../auth/auth.types.js";
import { IdParamDto } from "../common/catalog-list.js";
import { CategoriesService } from "../categories/categories.service.js";
import { StreamsService } from "../streams/streams.service.js";
import { PredictionsService } from "./predictions.service.js";

// Chỉ đọc. Phạm vi nhìn thấy theo stream (USER chỉ thấy stream ACTIVE), giống GET /streams/:id/game-sessions.
@Controller("streams/:id/predictions")
export class PredictionsController {
  constructor(private predictions: PredictionsService, private streams: StreamsService) {}

  /**
   * Prediction mới nhất của stream (portal gọi khi mở / reload trang). 404 nếu stream không tồn tại / ngoài phạm vi, hoặc chưa có prediction.
   * Ván còn RUNNING: chỉ user đã bị trừ tiền cho ván đó thấy pick, còn lại `{ locked: true, shoe, round, ... }` ("Dự đoán từ ván sau").
   */
  @Get("current")
  async current(@CurrentUser() actor: AuthUser, @Param() params: IdParamDto) {
    await this.streams.getOne(actor.role, params.id);
    const prediction = await this.predictions.currentFor(actor, params.id);
    if (!prediction) throw new NotFoundException();
    return prediction;
  }

  /** Tỷ lệ thắng, chuỗi thắng và các dự đoán gần nhất (biểu đồ độ tin cậy) của stream. Luôn 200 (rỗng khi chưa có dự đoán). */
  @Get("stats")
  async stats(@CurrentUser() actor: AuthUser, @Param() params: IdParamDto) {
    await this.streams.getOne(actor.role, params.id);
    return this.predictions.stats(params.id);
  }

  /** Chuỗi thắng tốt nhất của shoe hiện tại (trang chi tiết). Luôn 200 (`best_streak: 0` khi chưa có dự đoán). */
  @Get("best-streak")
  async bestStreak(@CurrentUser() actor: AuthUser, @Param() params: IdParamDto) {
    await this.streams.getOne(actor.role, params.id);
    return this.predictions.bestStreak(params.id);
  }
}

/** Thống kê cho danh sách bàn của một category. Đặt dưới /categories/:id để không đụng GET /streams/:id. */
@Controller("categories/:id/stream-stats")
export class CategoryStreamStatsController {
  constructor(private predictions: PredictionsService, private categories: CategoriesService) {}

  @Get()
  async list(@CurrentUser() actor: AuthUser, @Param() params: IdParamDto) {
    await this.categories.getOne(actor.role, params.id);   // 404 khi category không tồn tại / ngoài phạm vi
    return { items: await this.predictions.listStats(actor.role, params.id) };
  }
}
