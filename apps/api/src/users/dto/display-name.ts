// src/users/dto/display-name.ts
import { Transform } from "class-transformer";
import { applyDecorators } from "@nestjs/common";
import { IsString, Length, Matches } from "class-validator";

/** Tên hiển thị: trim, 1–50 ký tự, không ký tự điều khiển (khớp CHECK ở V14). */
export const DisplayName = () =>
  applyDecorators(
    Transform(({ value }) => (typeof value === "string" ? value.trim() : value)),
    IsString(),
    Length(1, 50),
    Matches(/^[^\p{Cc}]+$/u, { message: "display_name must not contain control characters" }),
  );
