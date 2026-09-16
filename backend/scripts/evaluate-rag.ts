import { readFileSync } from 'node:fs';
import { compareRetrievalRuns, RetrievalEvaluationCase } from '../src/ai/utils/retrieval-evaluation';

const inputPath = process.argv[2];
if (!inputPath) {
  process.stderr.write('사용법: npm run rag:evaluate -- <평가 입력 JSON 경로>\n');
  process.exitCode = 1;
} else {
  try {
    const input = JSON.parse(readFileSync(inputPath, 'utf8')) as { k: number; cases: RetrievalEvaluationCase[] };
    if (!Array.isArray(input.cases)) throw new Error('cases 배열이 필요합니다.');
    const report = compareRetrievalRuns(input.cases, input.k);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`RAG 평가 입력 또는 계산 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}\n`);
    process.exitCode = 1;
  }
}
