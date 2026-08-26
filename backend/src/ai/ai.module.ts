import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../users/user.entity';
import { AdminBlogsController } from './admin-blogs.controller';
import { AdminDocumentsController } from './admin-documents.controller';
import { AdminRagController } from './admin-rag.controller';
import { AgentService } from './agent.service';
import { AiController } from './ai.controller';
import { BlogSearchService } from './blog-search.service';
import { EmbeddingService } from './embedding.service';
import { AiQuestion } from './entities/ai-question.entity';
import { DocumentChunk } from './entities/document-chunk.entity';
import { Faq } from './entities/faq.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';
import { GithubMcpService } from './github-mcp.service';
import { LlmService } from './llm.service';
import { McpController } from './mcp.controller';
import { RagService } from './rag.service';
import { RagMetricsService } from './rag-metrics.service';
import { RagReindexJob } from './entities/rag-reindex-job.entity';
import { RagReindexJobItem } from './entities/rag-reindex-job-item.entity';
import { RagReindexService } from './rag-reindex.service';

@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeDocument, DocumentChunk, AiQuestion, Faq, User, RagReindexJob, RagReindexJobItem]), AuthModule],
  controllers: [AdminBlogsController, AdminDocumentsController, AdminRagController, AiController, FaqController, McpController],
  providers: [AgentService, RagService, RagMetricsService, RagReindexService, EmbeddingService, LlmService, FaqService, GithubMcpService, BlogSearchService],
})
export class AiModule {}
