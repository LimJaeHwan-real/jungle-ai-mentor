import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmbeddingService } from '../src/ai/embedding.service';
import { EvidenceAssessmentService } from '../src/ai/evidence-assessment.service';
import { RagMetricsService } from '../src/ai/rag-metrics.service';
import { RagService } from '../src/ai/rag.service';
import { collectComparableRetrievalResults } from '../src/ai/utils/rag-retrieval-collector';
import { ReadOnlyRagCollectorRepository } from '../src/ai/utils/read-only-rag-collector-repository';
import { createReadOnlyCollectorDataSource } from '../src/ai/utils/rag-collector-runtime';

async function main() {
  const source = await createReadOnlyCollectorDataSource(
    () => { ConfigModule.forRoot({ isGlobal: false, envFilePath: ['.env.local', '.env'] }); },
    async () => (await import('../src/database/data-source')).createDataSourceOptions(),
  );
  const config = new ConfigService(process.env);
  const metrics = new RagMetricsService();
  const embeddings = new EmbeddingService(config, metrics);
  embeddings.onModuleInit();
  if (embeddings.getMetadata().mode !== 'real') throw new Error('live collection requires RAG_EMBEDDING_MODE=real');
  await source.initialize();
  const runner = source.createQueryRunner();

  try {
    await runner.connect();
    await runner.startTransaction('REPEATABLE READ');
    await runner.query('SET TRANSACTION READ ONLY');

    const repository = new ReadOnlyRagCollectorRepository(
      { query: (sql, parameters) => runner.query(sql, parameters) },
      embeddings.getMetadata(),
    );
    const candidates = new RagService(
      {} as never,
      { query: repository.query.bind(repository) } as never,
      embeddings,
      source,
      metrics,
      new EvidenceAssessmentService(config),
    );
    const artifact = await collectComparableRetrievalResults({
      embedQuestions: (questions) => embeddings.embedBatch(questions),
      repository,
      candidate: candidates,
    });
    const outputPath = resolve(process.argv[2] ?? `.rag-evaluation-results/retrieval-${Date.now()}.json`);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    process.stdout.write(`RAG retrieval collection completed: ${outputPath}\n`);
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}

main().catch(() => {
  process.stderr.write('RAG retrieval collection failed; no artifact was written.\n');
  process.exitCode = 1;
});
