import { DataSource } from 'typeorm';
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

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'jungle',
  password: process.env.DB_PASSWORD ?? 'jungle',
  database: process.env.DB_NAME ?? 'jungle_ai_mentor',
  entities: [User, Post, Comment, Tag, KnowledgeDocument, DocumentChunk, AiQuestion, Faq, RagReindexJob, RagReindexJobItem],
  migrations: [CreateRagFtsGinIndexes1787719500000, CreateRagReindexJobs1787721000000],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
});
