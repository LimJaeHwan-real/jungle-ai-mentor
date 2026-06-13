import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { ListPostsDto } from './dto/list-posts.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

@Controller()
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post('posts')
  @UseGuards(JwtAuthGuard)
  createPost(@CurrentUser() user: User, @Body() dto: CreatePostDto) {
    return this.postsService.createPost(user, dto);
  }

  @Get('posts')
  listPosts(@Query() query: ListPostsDto) {
    return this.postsService.listPosts(query);
  }

  @Get('posts/:id')
  getPost(@Param('id') id: string) {
    return this.postsService.getPost(id);
  }

  @Patch('posts/:id')
  @UseGuards(JwtAuthGuard)
  updatePost(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.updatePost(user, id, dto);
  }

  @Delete('posts/:id')
  @UseGuards(JwtAuthGuard)
  deletePost(@CurrentUser() user: User, @Param('id') id: string) {
    return this.postsService.deletePost(user, id);
  }

  @Post('posts/:postId/comments')
  @UseGuards(JwtAuthGuard)
  createComment(@CurrentUser() user: User, @Param('postId') postId: string, @Body() dto: CreateCommentDto) {
    return this.postsService.createComment(user, postId, dto);
  }

  @Get('posts/:postId/comments')
  listComments(@Param('postId') postId: string) {
    return this.postsService.listComments(postId);
  }

  @Patch('comments/:id')
  @UseGuards(JwtAuthGuard)
  updateComment(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateCommentDto) {
    return this.postsService.updateComment(user, id, dto);
  }

  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  deleteComment(@CurrentUser() user: User, @Param('id') id: string) {
    return this.postsService.deleteComment(user, id);
  }
}

