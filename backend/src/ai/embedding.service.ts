import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

@Injectable()
export class EmbeddingService {
  private readonly dimension = 1536;

  constructor(private readonly config: ConfigService) {}

  async embed(text: string): Promise<number[]> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      return this.mockEmbedding(text);
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

      if (!response.ok) {
        return this.mockEmbedding(text);
      }

      const data = (await response.json()) as { data?: Array<{ embedding: number[] }> };
      return data.data?.[0]?.embedding ?? this.mockEmbedding(text);
    } catch {
      return this.mockEmbedding(text);
    }
  }

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

