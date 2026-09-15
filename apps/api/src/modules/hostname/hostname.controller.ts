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
import { HostnameService } from './hostname.service';
import { CreateHostnameDto } from './dto/create-hostname.dto';
import { UpdateHostnameDto } from './dto/update-hostname.dto';

/** Homepage (hostname) management — ADMIN_CON only, scoped to the caller. */
@Controller('hostnames')
@Roles(Role.ADMIN_CON)
export class HostnameController {
  constructor(private readonly service: HostnameService) {}

  @Post()
  create(@CurrentUser() actor: JwtPayload, @Body() dto: CreateHostnameDto) {
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
    @Body() dto: UpdateHostnameDto,
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
}
