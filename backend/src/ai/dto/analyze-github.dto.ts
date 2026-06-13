import { IsString, IsUrl } from 'class-validator';

export class AnalyzeGithubDto {
  @IsString()
  @IsUrl({ require_protocol: true })
  repositoryUrl: string;
}

