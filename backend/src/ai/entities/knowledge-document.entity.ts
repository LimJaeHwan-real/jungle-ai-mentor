import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DocumentChunk } from './document-chunk.entity';

@Entity('documents')
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ default: 'GENERAL' })
  category: string;

  @Column({ default: 'ADMIN' })
  sourceType: string;

  @Column({ nullable: true })
  sourceUrl?: string;

  @Column({ nullable: true })
  contentHash?: string;

  @Column({ default: 'ACTIVE' })
  indexStatus: string;

  @Column({ nullable: true })
  embeddingModel?: string;

  @Column({ type: 'varchar', nullable: true })
  embeddingProvider?: string | null;

  @Column({ nullable: true })
  embeddingMode?: string;

  @Column({ nullable: true })
  embeddingVersion?: string;

  @Column({ nullable: true })
  embeddingDimension?: number;

  @Column({ type: 'timestamp', nullable: true })
  embeddingGeneratedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  indexedAt?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  indexErrorCode?: string | null;

  @OneToMany(() => DocumentChunk, (chunk) => chunk.document)
  chunks: DocumentChunk[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

