import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { JwtPayload, Role } from '@toolhackchain/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { GrantPointsDto } from './dto/grant-points.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/**
 * User management — ADMIN_CON only (see CLAUDE.md). Every action is scoped to
 * the calling Admin(Con) inside UserService, so an Admin(Con) only ever touches
 * its own Users.
 */
@Controller('users')
@Roles(Role.ADMIN_CON)
export class UserController {
  constructor(private readonly service: UserService) {}

  @Post()
  create(@CurrentUser() actor: JwtPayload, @Body() dto: CreateUserDto) {
    return this.service.create(actor.sub, dto);
  }

  @Get()
  findAll(@CurrentUser() actor: JwtPayload) {
    return this.service.findAll(actor.sub);
  }

  @Get(':id')
  findOne(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.findOne(actor.sub, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.update(actor.sub, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(actor.sub, id);
  }

  @Patch(':id/deactivate')
  deactivate(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deactivate(actor.sub, id);
  }

  @Patch(':id/activate')
  activate(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.activate(actor.sub, id);
  }

  @Post(':id/points')
  grantPoints(
    @CurrentUser() actor: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantPointsDto,
  ) {
    return this.service.grantPoints(actor.sub, id, dto);
  }
}
