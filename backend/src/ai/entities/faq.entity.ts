import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AiQuestion } from './ai-question.entity';

@Entity('faqs')
export class Faq {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  aiQuestionId: string;

  @OneToOne(() => AiQuestion, (question) => question.faq, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'aiQuestionId' })
  aiQuestion: AiQuestion;

  @Column()
  title: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  @Column({ default: 'GENERAL' })
  category: string;

  @Column({ default: 0 })
  viewCount: number;

  @Column({ default: 0 })
  likeCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

