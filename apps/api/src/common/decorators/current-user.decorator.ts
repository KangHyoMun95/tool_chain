import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '@toolhackchain/shared';

/** Injects the authenticated JWT payload (set by JwtAuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
