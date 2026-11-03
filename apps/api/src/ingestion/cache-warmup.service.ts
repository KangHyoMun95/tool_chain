// src/ingestion/cache-warmup.service.ts
import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { DataSource } from "typeorm";
import { RedisKeys } from "@toolhackchain/shared";
import { normSql } from "../common/normalize.js";
import { IdCache } from "./id-cache.service.js";

/** Nạp sẵn cache key_id → stream_id từ DB lúc khởi động, để realtime gắn được stream_id ngay từ tick đầu. */
@Injectable()
export class CacheWarmup implements OnApplicationBootstrap {
  private readonly log = new Logger(CacheWarmup.name);
  constructor(@InjectDataSource() private ds: DataSource, private ids: IdCache) {}

  async onApplicationBootstrap() {
    try {
      const rows: { key_id: string; stream_id: string }[] = await this.ds.query(
        `SELECT ${normSql("l.lobby_name")} || '|' || ${normSql("c.category_name")} || '|' || ${normSql("s.stream_name")} AS key_id,
                s.stream_id
         FROM streams s
         JOIN categories c ON c.category_id = s.category_id
         JOIN lobbies l ON l.lobby_id = c.lobby_id`,
      );
      await this.ids.setMany(rows.map((r) => [RedisKeys.stream(r.key_id), r.stream_id]));
      this.log.log(`Đã nạp ${rows.length} stream vào cache id`);
    } catch (e) {
      this.log.warn(`Không nạp được cache id (bỏ qua, cache sẽ tự đầy): ${e}`);
    }
  }
}
