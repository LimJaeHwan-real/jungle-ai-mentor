import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentChunk } from '../ai/entities/document-chunk.entity';
import { KnowledgeDocument } from '../ai/entities/knowledge-document.entity';
import { EmbeddingService } from '../ai/embedding.service';
import { RagService } from '../ai/rag.service';
import { AuthModule } from '../auth/auth.module';
import { User } from '../users/user.entity';
import { Comment } from './entities/comment.entity';
import { Post } from './entities/post.entity';
import { Tag } from './entities/tag.entity';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Comment, Tag, User, KnowledgeDocument, DocumentChunk]), AuthModule],
  controllers: [PostsController],
  providers: [PostsService, RagService, EmbeddingService],
})
export class PostsModule {}
