import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

/** Partial update of a homepage (hostname). */
export class UpdateHostnameDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  url?: string;
}
