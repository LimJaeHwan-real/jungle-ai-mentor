import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/user.entity';
import { Faq } from './faq.entity';

export enum AgentRoute {
  JUNGLE_KNOWLEDGE = 'JUNGLE_KNOWLEDGE',
  FAQ_SEARCH = 'FAQ_SEARCH',
  GITHUB_REPO = 'GITHUB_REPO',
  GENERAL = 'GENERAL',
}

@Entity('ai_questions')
export class AiQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  userId?: string;

  @ManyToOne(() => User, (user) => user.aiQuestions, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  usedTools: string[];

  @Column({ type: 'enum', enum: AgentRoute, default: AgentRoute.GENERAL })
  agentRoute: AgentRoute;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  agentState: Record<string, unknown>;

  @Column({ default: false })
  isPublic: boolean;

  @OneToOne(() => Faq, (faq) => faq.aiQuestion)
  faq?: Faq;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
