import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class AskAiDto {
  @IsString()
  @MinLength(2)
  question: string;

  @IsOptional()
  @IsString()
  repositoryUrl?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoBlogSearch?: boolean;
}
