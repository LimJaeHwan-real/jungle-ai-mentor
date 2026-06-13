import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../users/user.entity';
import { Comment } from './entities/comment.entity';
import { Post } from './entities/post.entity';
import { Tag } from './entities/tag.entity';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Comment, Tag, User]), AuthModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
