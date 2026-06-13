import { IsOptional, IsString, MinLength } from 'class-validator';

export class PublishFaqDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

