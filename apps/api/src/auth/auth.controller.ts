// src/auth/auth.controller.ts
import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { CookieOptions, Request, Response } from "express";
import type { EnvVars } from "../config/env.validation.js";
import { AuthService } from "./auth.service.js";
import type { AuthUser } from "./auth.types.js";
import { CurrentUser, Public } from "./decorators.js";
import { LoginDto } from "./dto/login.dto.js";

export const REFRESH_COOKIE = "refresh_token";
// Khớp global prefix "api" trong main.ts.
const REFRESH_COOKIE_PATH = "/api/auth/refresh";

@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService,
    private config: ConfigService<EnvVars, true>,
  ) {}

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: true, sameSite: "strict", path: REFRESH_COOKIE_PATH };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: this.config.get("SESSION_TTL_SECONDS", { infer: true }) * 1000,
    });
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // theo IP; khóa theo phone nằm ở LoginAttemptsService
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, expiresIn, refreshToken } = await this.auth.login(dto.phone_number, dto.password, req.ip ?? "unknown");
    this.setRefreshCookie(res, refreshToken);
    return { access_token: accessToken, token_type: "Bearer", expires_in: expiresIn };
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    try {
      const { accessToken, expiresIn, refreshToken } = await this.auth.refresh(token, req.ip ?? "unknown");
      this.setRefreshCookie(res, refreshToken);
      return { access_token: accessToken, token_type: "Bearer", expires_in: expiresIn };
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw e;
    }
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.userId);
  }
}
