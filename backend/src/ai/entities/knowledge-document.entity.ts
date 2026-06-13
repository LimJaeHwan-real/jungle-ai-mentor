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

  @OneToMany(() => DocumentChunk, (chunk) => chunk.document)
  chunks: DocumentChunk[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

