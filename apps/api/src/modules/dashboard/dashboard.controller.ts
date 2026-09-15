import { Controller, Get } from '@nestjs/common';
import { DashboardResponse, JwtPayload, Role } from '@toolhackchain/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

/** Dashboard metrics for the admin areas (HOST and ADMIN_CON). */
@Controller('dashboard')
@Roles(Role.HOST, Role.ADMIN_CON)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload): Promise<DashboardResponse> {
    return this.service.getDashboard(user);
  }
}
