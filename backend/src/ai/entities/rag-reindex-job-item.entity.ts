import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type RagReindexJobItemStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

@Entity('rag_reindex_job_items')
export class RagReindexJobItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  jobId: string;

  @Column({ type: 'uuid', nullable: true })
  documentId?: string | null;

  @Column({ default: 'PENDING' })
  status: RagReindexJobItemStatus;

  @Column({ type: 'varchar', nullable: true })
  errorCode?: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  leaseUntil?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
