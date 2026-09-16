import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type RagReindexJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_FAILURES';

@Entity('rag_reindex_jobs')
export class RagReindexJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'QUEUED' })
  status: RagReindexJobStatus;

  @Column({ default: 0 })
  targetCount: number;

  @Column({ default: 0 })
  successCount: number;

  @Column({ default: 0 })
  failureCount: number;

  @Column({ default: 0 })
  duplicateCount: number;

  @Column({ type: 'varchar', nullable: true })
  embeddingModel?: string | null;

  @Column({ type: 'varchar', nullable: true })
  embeddingMode?: string | null;

  @Column({ type: 'varchar', nullable: true })
  embeddingVersion?: string | null;

  @Column({ type: 'integer', nullable: true })
  embeddingDimension?: number | null;

  @Column({ type: 'varchar', nullable: true })
  chunkingVersion?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
