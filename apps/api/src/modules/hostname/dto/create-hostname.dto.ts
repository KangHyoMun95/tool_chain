import { IsString, Length, MaxLength } from 'class-validator';

/** Payload for an Admin(Con) creating a homepage (hostname). */
export class CreateHostnameDto {
  @IsString()
  @Length(1, 255)
  name: string;

  @IsString()
  @MaxLength(1024)
  url: string;
}
