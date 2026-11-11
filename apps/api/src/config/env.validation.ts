// src/config/env.validation.ts
import { plainToInstance } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, MinLength, validateSync } from "class-validator";

export class EnvVars {
  @IsString() @MinLength(32) JWT_SECRET!: string;
  @IsString() @MinLength(32) JWT_REFRESH_SECRET!: string;
  @IsString() @IsNotEmpty() REDIS_URL!: string;
  @IsString() @IsNotEmpty() DATABASE_URL!: string;
  @IsString() @IsNotEmpty() CORS_ORIGINS!: string; // phân tách bằng dấu phẩy

  // Billing: phí mỗi dự đoán (điểm, số nguyên > 0). Bắt buộc: thiếu / sai thì app dừng.
  @IsInt() @Min(1) @Max(1_000_000_000) PREDICTION_FEE!: number;
  // Ván RUNNING không có result quá số phút này thì bị CANCELLED (và hoàn tiền). Job chỉ chạy khi GAME_SESSION_CANCEL_ENABLED=true.
  @IsOptional() @IsInt() @Min(1) @Max(1440) GAME_SESSION_CANCEL_AFTER_MINUTES: number = 5;
  @IsOptional() @IsIn(["true", "false"]) GAME_SESSION_CANCEL_ENABLED: "true" | "false" = "false";
  // Hub (SSE): stream chỉ nhận tick cũ hơn phiên đang giữ liên tục quá khoảng này ⇒ xóa state, tick kế tiếp khởi tạo lại.
  @IsOptional() @IsInt() @Min(5_000) @Max(3_600_000) HUB_STALE_RESET_MS: number = 60_000;
  // true ⇒ Nest logger in thêm mức DEBUG (mặc định chỉ log / warn / error / fatal). Đọc trong main.ts trước khi tạo app.
  @IsOptional() @IsIn(["true", "false"]) API_LOG_DEBUG: "true" | "false" = "false";

  @IsOptional() @IsInt() @Min(60) @Max(3600) ACCESS_TOKEN_TTL_SECONDS: number = 900;
  @IsOptional() @IsInt() @Min(300) SESSION_TTL_SECONDS: number = 7 * 24 * 3600;
  @IsOptional() @IsInt() @Min(1) LOGIN_MAX_ATTEMPTS: number = 5;
  @IsOptional() @IsInt() @Min(1) LOGIN_LOCK_MINUTES: number = 15;
  @IsOptional() @IsString() TRUST_PROXY?: string; // số hop, "loopback", ... — bỏ trống = không tin proxy
}

export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const env = plainToInstance(EnvVars, raw, { enableImplicitConversion: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    // Chỉ in tên biến và ràng buộc, không in giá trị (có thể là secret).
    const lines = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(", ")}`);
    throw new Error(`Invalid environment configuration:\n  ${lines.join("\n  ")}`);
  }
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error("Invalid environment configuration:\n  JWT_SECRET and JWT_REFRESH_SECRET must differ");
  }
  return env;
}
