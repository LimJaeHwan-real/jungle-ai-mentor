import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

export class CreateRagReindexJobDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  documentIds?: string[];
}
