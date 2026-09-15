import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** Replace the set of homepages (hostnames) assigned to a User. */
export class SetHostnamesDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  hostnameIds: string[];
}
