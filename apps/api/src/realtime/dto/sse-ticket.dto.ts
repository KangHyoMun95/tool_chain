// src/realtime/dto/sse-ticket.dto.ts
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { TICKET_ITEM_MAX_LENGTH, TICKET_MAX_ITEMS } from "../realtime.constants.js";

export class SseTicketDto {
  /** key_id chỉ nhận tick (trang danh sách). Không bao giờ làm kết nối thành participant. */
  @IsOptional() @IsArray() @ArrayMaxSize(TICKET_MAX_ITEMS) @IsString({ each: true }) @MaxLength(TICKET_ITEM_MAX_LENGTH, { each: true })
  items: string[] = [];

  /** Trang chi tiết: tham gia stream này (chỉ USER, đủ điểm). Kết nối sẽ bị trừ tiền cho mỗi dự đoán có pick. */
  @IsOptional() @IsUUID() participate_stream_id?: string;
}
