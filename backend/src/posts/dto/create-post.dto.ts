import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PostCategory, PostType } from '../entities/post.entity';

export class CreatePostDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @MinLength(2)
  content: string;

  @IsEnum(PostType)
  type: PostType;

  @IsEnum(PostCategory)
  category: PostCategory;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  tags?: string[];
}

