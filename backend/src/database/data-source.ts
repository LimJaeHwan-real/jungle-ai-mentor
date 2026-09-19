import { DataSource, DataSourceOptions } from 'typeorm';
import { AiQuestion } from '../ai/entities/ai-question.entity';
import { DocumentChunk } from '../ai/entities/document-chunk.entity';
import { Faq } from '../ai/entities/faq.entity';
import { KnowledgeDocument } from '../ai/entities/knowledge-document.entity';
import { Comment } from '../posts/entities/comment.entity';
import { Post } from '../posts/entities/post.entity';
import { Tag } from '../posts/entities/tag.entity';
import { User } from '../users/user.entity';
import { CreateRagFtsGinIndexes1787719500000 } from './migrations/1787719500000-CreateRagFtsGinIndexes';
import { CreateRagReindexJobs1787721000000 } from './migrations/1787721000000-CreateRagReindexJobs';
import { RagReindexJob } from '../ai/entities/rag-reindex-job.entity';
import { RagReindexJobItem } from '../ai/entities/rag-reindex-job-item.entity';
import { AddRagEmbeddingMetadata1787722000000 } from './migrations/1787722000000-AddRagEmbeddingMetadata';
import { AddRagChunkProvenance1787723000000 } from './migrations/1787723000000-AddRagChunkProvenance';

export function createDataSourceOptions(environment: Readonly<Record<string, string | undefined>> = process.env): DataSourceOptions {
  return {
  type: 'postgres',
  host: environment.DB_HOST ?? 'localhost',
  port: Number(environment.DB_PORT ?? 5432),
  username: environment.DB_USER ?? 'jungle',
  password: environment.DB_PASSWORD ?? 'jungle',
  database: environment.DB_NAME ?? 'jungle_ai_mentor',
  entities: [User, Post, Comment, Tag, KnowledgeDocument, DocumentChunk, AiQuestion, Faq, RagReindexJob, RagReindexJobItem],
  migrations: [CreateRagFtsGinIndexes1787719500000, CreateRagReindexJobs1787721000000, AddRagEmbeddingMetadata1787722000000, AddRagChunkProvenance1787723000000],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  };
}

export default new DataSource(createDataSourceOptions());
