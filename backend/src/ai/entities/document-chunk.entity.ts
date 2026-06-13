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

  @Column({ type: 'vector' as 'text', length: 1536, nullable: true })
  embedding?: number[];

  @Column({ default: 0 })
  tokenCount: number;

  @CreateDateColumn()
  createdAt: Date;
}

