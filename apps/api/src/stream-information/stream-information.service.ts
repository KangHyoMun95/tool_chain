// src/stream-information/stream-information.service.ts
import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";

export type StreamerInput = { streamId: string; streamerId: string };

@Injectable()
export class StreamInformationService {
  /** Một dòng cho mỗi stream; chỉ ghi khi streamer_id khác giá trị đang có. streamId trong items phải khác nhau. */
  async upsertMany(m: EntityManager, items: StreamerInput[]): Promise<void> {
    if (items.length === 0) return;
    await m.query(
      `INSERT INTO stream_information (stream_id, streamer_id)
       SELECT * FROM unnest($1::bigint[], $2::text[])
       ON CONFLICT (stream_id) DO UPDATE SET streamer_id = EXCLUDED.streamer_id
       WHERE stream_information.streamer_id IS DISTINCT FROM EXCLUDED.streamer_id`,
      [items.map((i) => i.streamId), items.map((i) => i.streamerId)],
    );
  }
}
