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
import { AdminConService } from './admin-con.service';
import { CreateAdminConDto } from './dto/create-admin-con.dto';
import { UpdateAdminConDto } from './dto/update-admin-con.dto';

/**
 * Admin(Con) management — HOST only (see CLAUDE.md). Every action is scoped to
 * the calling Host inside AdminConService, so a Host only ever touches its own
 * Admin(Con)s.
 */
@Controller('admin-cons')
@Roles(Role.HOST)
export class AdminConController {
  constructor(private readonly service: AdminConService) {}

  @Post()
  create(@CurrentUser() host: JwtPayload, @Body() dto: CreateAdminConDto) {
    return this.service.create(host.sub, dto);
  }

  @Get()
  findAll(@CurrentUser() host: JwtPayload) {
    return this.service.findAll(host.sub);
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
    @Body() dto: UpdateAdminConDto,
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
}
