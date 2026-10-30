// src/config/env.validation.ts
import { plainToInstance } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, MinLength, validateSync } from "class-validator";

export class EnvVars {
  @IsString() @MinLength(32) JWT_SECRET!: string;
  @IsString() @MinLength(32) JWT_REFRESH_SECRET!: string;
  @IsString() @IsNotEmpty() REDIS_URL!: string;
  @IsString() @IsNotEmpty() DATABASE_URL!: string;
  @IsString() @IsNotEmpty() CORS_ORIGINS!: string; // phân tách bằng dấu phẩy

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
