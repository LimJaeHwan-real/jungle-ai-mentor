import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RagMetricsService } from './rag-metrics.service';
import { CreateRagReindexJobDto } from './dto/create-rag-reindex-job.dto';
import { RagReindexService } from './rag-reindex.service';
import { RagService } from './rag.service';

@Controller('admin/rag')
@UseGuards(JwtAuthGuard)
export class AdminRagController {
  constructor(
    private readonly ragService: RagService,
    private readonly ragMetricsService: RagMetricsService,
    private readonly ragReindexService: RagReindexService,
  ) {}

  @Get('metrics')
  getMetrics() {
    return this.ragMetricsService.getSnapshot();
  }

  @Get('reindex-targets')
  getReindexTargets() {
    return this.ragService.listReindexTargets();
  }

  @Post('reindex-jobs')
  createReindexJob(@Body() dto: CreateRagReindexJobDto) {
    return this.ragReindexService.createJob(dto.documentIds);
  }

  @Get('reindex-jobs/:jobId')
  getReindexJob(@Param('jobId') jobId: string) {
    return this.ragReindexService.getJob(jobId);
  }
}
