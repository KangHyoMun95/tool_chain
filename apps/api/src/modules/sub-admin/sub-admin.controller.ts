import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { JwtPayload, Role } from '@toolhackchain/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubAdminService } from './sub-admin.service';
import { CreateSubAdminDto } from './dto/create-sub-admin.dto';
import { GrantPointsDto } from './dto/grant-points.dto';
import { UpdateSubAdminDto } from './dto/update-sub-admin.dto';

/**
 * Admin(Con) management — HOST only (see CLAUDE.md). Every action is scoped to
 * the calling Host inside SubAdminService, so a Host only ever touches its own
 * Admin(Con)s.
 */
@Controller('sub-admins')
@Roles(Role.HOST)
export class SubAdminController {
  constructor(private readonly service: SubAdminService) {}

  @Post()
  create(@CurrentUser() host: JwtPayload, @Body() dto: CreateSubAdminDto) {
    return this.service.create(host.sub, dto);
  }

  @Get()
  findAll(@CurrentUser() host: JwtPayload) {
    return this.service.findAll(host.sub);
  }

  @Get(':id/users')
  listUsers(
    @CurrentUser() host: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.listUsers(host.sub, id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() host: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(host.sub, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() host: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubAdminDto,
  ) {
    return this.service.update(host.sub, id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(
    @CurrentUser() host: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deactivate(host.sub, id);
  }

  @Patch(':id/activate')
  activate(
    @CurrentUser() host: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.activate(host.sub, id);
  }

  @Post(':id/points')
  grantPoints(
    @CurrentUser() host: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantPointsDto,
  ) {
    return this.service.grantPoints(host.sub, id, dto);
  }
}
