// src/streams/dto/stream-list-query.dto.ts
import { IsOptional } from "class-validator";
import { CatalogListQueryDto, IdQuery } from "../../common/catalog-list.js";

export class StreamListQueryDto extends CatalogListQueryDto {
  @IsOptional() @IdQuery() lobby_id?: string;
  @IsOptional() @IdQuery() category_id?: string;
}
