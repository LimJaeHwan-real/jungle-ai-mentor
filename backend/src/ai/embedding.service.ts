import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly dimension: number;

  constructor(private readonly config: ConfigService) {
    this.dimension = Number(this.config.get<string>('RAG_EMBEDDING_DIMENSION') ?? 1536);
  }

  onModuleInit() {
    const mode = this.mode();
    if (mode === 'mock' && !this.mockAllowed()) throw new Error('RAG_EMBEDDING_MODE=mock은 demo 또는 local 환경에서만 허용됩니다.');
    if (this.runtime() === 'production' && !this.config.get<string>('OPENAI_API_KEY')) {
      throw new Error('production 환경에서는 OPENAI_API_KEY가 필요합니다. mock embedding 자동 전환은 허용되지 않습니다.');
    }
  }

  async embed(text: string): Promise<number[]> {
    if (this.mode() === 'mock') return this.mockEmbedding(text);
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('임베딩 서비스를 사용할 수 없습니다. 명시적 demo/local mock 모드가 아닌 경우 mock으로 전환하지 않습니다.');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.get<string>('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small',
          input: text,
        }),
      });

      if (!response.ok) throw new ServiceUnavailableException(`임베딩 서비스 요청이 실패했습니다(${response.status}).`);

      const data = (await response.json()) as { data?: Array<{ embedding: number[] }> };
      const embedding = data.data?.[0]?.embedding;
      if (!embedding || embedding.length !== this.dimension || embedding.some((value) => !Number.isFinite(value))) {
        throw new ServiceUnavailableException('임베딩 응답의 차원이 설정값과 다르거나 유효하지 않습니다.');
      }
      return embedding;
    } catch {
      throw new ServiceUnavailableException('임베딩 서비스를 사용할 수 없습니다. mock으로 자동 전환하지 않습니다.');
    }
  }

  getMetadata() { return { mode: this.mode(), model: this.mode() === 'mock' ? 'deterministic-demo' : this.config.get<string>('OPENAI_EMBEDDING_MODEL') ?? 'text-embedding-3-small', dimension: this.dimension, version: this.config.get<string>('RAG_EMBEDDING_VERSION') ?? 'v1' }; }
  private runtime() { return this.config.get<string>('RAG_RUNTIME_ENV') ?? (this.config.get<string>('NODE_ENV') === 'production' ? 'production' : 'local'); }
  private mode() { return this.config.get<string>('RAG_EMBEDDING_MODE') ?? 'real'; }
  private mockAllowed() { return ['demo', 'local'].includes(this.runtime()); }

  toSqlVector(embedding: number[]) {
    return `[${embedding.slice(0, this.dimension).join(',')}]`;
  }

  private mockEmbedding(text: string) {
    const vector = new Array<number>(this.dimension).fill(0);
    const tokens = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);

    for (const token of tokens.length ? tokens : [text]) {
      const hash = createHash('sha256').update(token).digest();
      for (let i = 0; i < hash.length; i += 1) {
        const index = (hash[i] + i * 31) % this.dimension;
        vector[index] += 1;
      }
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => Number((value / norm).toFixed(6)));
  }
}

