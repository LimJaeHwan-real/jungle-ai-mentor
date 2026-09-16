import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { KnowledgeDocument } from './knowledge-document.entity';

@Entity('document_chunks')
export class DocumentChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  documentId: string;

  @ManyToOne(() => KnowledgeDocument, (document) => document.chunks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'documentId' })
  document: KnowledgeDocument;

  @Column()
  chunkIndex: number;

  @Column({ type: 'text' })
  chunkText: string;

  @Column({ nullable: true })
  sectionPath?: string;

  @Column({ nullable: true })
  sourceStart?: number;

  @Column({ nullable: true })
  sourceEnd?: number;

  @Column({ type: 'vector' as 'text', length: 1536, nullable: true })
  embedding?: number[];

  @Column({ type: 'varchar', nullable: true })
  embeddingProvider?: string | null;

  @Column({ type: 'varchar', nullable: true })
  embeddingModel?: string | null;

  @Column({ type: 'integer', nullable: true })
  embeddingDimension?: number | null;

  @Column({ type: 'varchar', nullable: true })
  embeddingMode?: string | null;

  @Column({ type: 'varchar', nullable: true })
  embeddingVersion?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  embeddingGeneratedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  indexedAt?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  indexStatus?: string | null;

  @Column({ type: 'varchar', nullable: true })
  indexErrorCode?: string | null;

  @Column({ type: 'varchar', nullable: true })
  chunkingVersion?: string | null;

  @Column({ type: 'varchar', nullable: true })
  documentTitle?: string | null;

  @Column({ type: 'varchar', nullable: true })
  sourceUrl?: string | null;

  @Column({ default: 0 })
  tokenCount: number;

  @CreateDateColumn()
  createdAt: Date;
}

