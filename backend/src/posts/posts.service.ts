import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { ListCommentsDto } from './dto/list-comments.dto';
import { ListPostsDto } from './dto/list-posts.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { Comment } from './entities/comment.entity';
import { Post } from './entities/post.entity';
import { Tag } from './entities/tag.entity';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
  ) {}

  async createPost(user: User, dto: CreatePostDto) {
    const tags = await this.resolveTags(dto.tags ?? []);
    const post = await this.posts.save(
      this.posts.create({
        userId: user.id,
        title: dto.title,
        content: dto.content,
        type: dto.type,
        category: dto.category,
        tags,
      }),
    );
    return this.getPost(post.id, false);
  }

  async listPosts(query: ListPostsDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    const qb = this.posts
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoinAndSelect('post.tags', 'tag')
      .orderBy('post.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.keyword) {
      qb.andWhere('(post.title ILIKE :keyword OR post.content ILIKE :keyword)', {
        keyword: `%${query.keyword}%`,
      });
    }
    if (query.type) {
      qb.andWhere('post.type = :type', { type: query.type });
    }
    if (query.category) {
      qb.andWhere('post.category = :category', { category: query.category });
    }
    if (query.tag) {
      qb.andWhere('tag.name = :tag', { tag: this.normalizeTag(query.tag) });
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((post) => this.serializePost(post)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPost(id: string, incrementView = true) {
    const post = await this.posts.findOne({
      where: { id },
      relations: {
        user: true,
        tags: true,
      },
    });
    if (!post) {
      throw new NotFoundException('Post not found.');
    }

    if (incrementView) {
      await this.posts.increment({ id }, 'viewCount', 1);
      post.viewCount += 1;
    }

    return this.serializePost(post);
  }

  async updatePost(user: User, id: string, dto: UpdatePostDto) {
    const post = await this.posts.findOne({ where: { id }, relations: { tags: true } });
    if (!post) {
      throw new NotFoundException('Post not found.');
    }
    this.assertOwner(user, post.userId);

    if (dto.title !== undefined) post.title = dto.title;
    if (dto.content !== undefined) post.content = dto.content;
    if (dto.type !== undefined) post.type = dto.type;
    if (dto.category !== undefined) post.category = dto.category;
    if (dto.tags !== undefined) post.tags = await this.resolveTags(dto.tags);

    await this.posts.save(post);
    return this.getPost(id, false);
  }

  async deletePost(user: User, id: string) {
    const post = await this.posts.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException('Post not found.');
    }
    this.assertOwner(user, post.userId);
    await this.posts.remove(post);
    return { ok: true };
  }

  async createComment(user: User, postId: string, dto: CreateCommentDto) {
    const post = await this.posts.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found.');
    }

    const comment = await this.comments.save(
      this.comments.create({
        postId,
        userId: user.id,
        content: dto.content,
      }),
    );
    await this.posts.increment({ id: postId }, 'commentCount', 1);
    return this.getComment(comment.id);
  }

  async listComments(postId: string, query: ListCommentsDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    const [comments, total] = await this.comments.findAndCount({
      where: { postId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: comments.map((comment) => this.serializeComment(comment)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateComment(user: User, id: string, dto: UpdateCommentDto) {
    const comment = await this.comments.findOne({ where: { id }, relations: { user: true } });
    if (!comment) {
      throw new NotFoundException('Comment not found.');
    }
    this.assertOwner(user, comment.userId);
    comment.content = dto.content;
    await this.comments.save(comment);
    return this.getComment(id);
  }

  async deleteComment(user: User, id: string) {
    const comment = await this.comments.findOne({ where: { id } });
    if (!comment) {
      throw new NotFoundException('Comment not found.');
    }
    this.assertOwner(user, comment.userId);
    await this.comments.remove(comment);
    await this.posts.decrement({ id: comment.postId }, 'commentCount', 1);
    return { ok: true };
  }

  private async getComment(id: string) {
    const comment = await this.comments.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found.');
    }
    return this.serializeComment(comment);
  }

  private async resolveTags(tagNames: string[]) {
    const names = [...new Set(tagNames.map((name) => this.normalizeTag(name)).filter(Boolean))];
    if (names.length === 0) {
      return [];
    }

    const existing = await this.tags.find({ where: { name: In(names) } });
    const existingNames = new Set(existing.map((tag) => tag.name));
    const created = await this.tags.save(
      names.filter((name) => !existingNames.has(name)).map((name) => this.tags.create({ name })),
    );
    return [...existing, ...created];
  }

  private normalizeTag(tag: string) {
    return tag.trim().replace(/^#/, '').toLowerCase();
  }

  private assertOwner(user: User, ownerId: string) {
    if (user.id !== ownerId) {
      throw new ForbiddenException('Only the author can change this resource.');
    }
  }

  private serializePost(post: Post) {
    return {
      id: post.id,
      title: post.title,
      content: post.content,
      type: post.type,
      category: post.category,
      viewCount: post.viewCount,
      commentCount: post.commentCount,
      tags: post.tags?.map((tag) => tag.name) ?? [],
      author: post.user
        ? {
            id: post.user.id,
            nickname: post.user.nickname,
          }
        : undefined,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }

  private serializeComment(comment: Comment) {
    return {
      id: comment.id,
      postId: comment.postId,
      content: comment.content,
      author: comment.user
        ? {
            id: comment.user.id,
            nickname: comment.user.nickname,
          }
        : undefined,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }
}

