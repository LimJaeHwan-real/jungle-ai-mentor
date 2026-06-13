import { Type } from 'class-transformer';
import { IsOptional, Max, Min } from 'class-validator';

export class ListCommentsDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit = 10;
}
