import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RagMetricsService } from './rag-metrics.service';
import { RagService } from './rag.service';

@Controller('admin/rag')
@UseGuards(JwtAuthGuard)
export class AdminRagController {
  constructor(
    private readonly ragService: RagService,
    private readonly ragMetricsService: RagMetricsService,
  ) {}

  @Get('metrics')
  getMetrics() {
    return this.ragMetricsService.getSnapshot();
  }

  @Get('reindex-targets')
  getReindexTargets() {
    return this.ragService.listReindexTargets();
  }
}
