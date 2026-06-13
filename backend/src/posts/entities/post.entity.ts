import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Comment } from './comment.entity';
import { Tag } from './tag.entity';

export enum PostType {
  QUESTION = 'QUESTION',
  INFO_SHARE = 'INFO_SHARE',
}

export enum PostCategory {
  STUDY = 'STUDY',
  ADMISSION = 'ADMISSION',
  COUNSEL = 'COUNSEL',
  INFO = 'INFO',
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.posts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: PostType })
  type: PostType;

  @Column({ type: 'enum', enum: PostCategory })
  category: PostCategory;

  @Column({ default: 0 })
  viewCount: number;

  @Column({ default: 0 })
  commentCount: number;

  @OneToMany(() => Comment, (comment) => comment.post)
  comments: Comment[];

  @ManyToMany(() => Tag, (tag) => tag.posts, { cascade: ['insert'] })
  @JoinTable({
    name: 'post_tags',
    joinColumn: { name: 'postId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
  })
  tags: Tag[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

