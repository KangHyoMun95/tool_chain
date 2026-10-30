// src/auth/session.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { SessionService } from "./session.service.js";
import { IS_PUBLIC_KEY } from "./decorators.js";

type AccessClaims = { sub?: unknown; sid?: unknown };

// Guard toàn cục: access token (JWT HS256) + phiên còn sống trên Redis.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) throw new UnauthorizedException();

    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token, { algorithms: ["HS256"] });
    } catch {
      throw new UnauthorizedException();
    }
    if (typeof claims.sub !== "string" || typeof claims.sid !== "string") throw new UnauthorizedException();

    const session = await this.sessions.get(claims.sid);
    if (!session || session.user_id !== claims.sub) throw new UnauthorizedException();

    req.user = { userId: session.user_id, role: session.role, sessionId: claims.sid };
    return true;
  }
}
