import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { Comment } from './posts/entities/comment.entity';
import { Post } from './posts/entities/post.entity';
import { Tag } from './posts/entities/tag.entity';
import { PostsModule } from './posts/posts.module';
import { User } from './users/user.entity';
import { DocumentChunk } from './ai/entities/document-chunk.entity';
import { KnowledgeDocument } from './ai/entities/knowledge-document.entity';
import { AiQuestion } from './ai/entities/ai-question.entity';
import { Faq } from './ai/entities/faq.entity';
import { AppController } from './app.controller';
import { MoviesModule } from './movies/movies.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST') ?? 'localhost',
        port: Number(config.get<string>('DB_PORT') ?? 5432),
        username: config.get<string>('DB_USER') ?? 'jungle',
        password: config.get<string>('DB_PASSWORD') ?? 'jungle',
        database: config.get<string>('DB_NAME') ?? 'jungle_ai_mentor',
        entities: [
          User,
          Post,
          Comment,
          Tag,
          KnowledgeDocument,
          DocumentChunk,
          AiQuestion,
          Faq,
        ],
        synchronize: config.get<string>('TYPEORM_SYNC') !== 'false',
      }),
    }),
    AuthModule,
    PostsModule,
    AiModule,
    MoviesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
