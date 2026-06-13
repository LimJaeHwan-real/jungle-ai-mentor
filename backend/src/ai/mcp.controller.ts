import { Body, Controller, Post } from '@nestjs/common';
import { AnalyzeGithubDto } from './dto/analyze-github.dto';
import { GithubMcpService } from './github-mcp.service';

@Controller('mcp/github')
export class McpController {
  constructor(private readonly githubMcpService: GithubMcpService) {}

  @Post('analyze')
  analyze(@Body() dto: AnalyzeGithubDto) {
    return this.githubMcpService.analyze(dto.repositoryUrl);
  }
}

