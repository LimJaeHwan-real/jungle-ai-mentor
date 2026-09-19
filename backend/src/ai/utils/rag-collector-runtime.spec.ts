import { createReadOnlyCollectorDataSource } from './rag-collector-runtime';

describe('RAG 수집기 시작 경계', () => {
  it('환경을 적재한 뒤 DB 옵션을 만들고 extension 설치를 시작 전에 차단한다', async () => {
    const steps: string[] = [];
    const source = await createReadOnlyCollectorDataSource(
      () => { steps.push('environment-loaded'); },
      async () => {
        steps.push('options-created');
        return {
          type: 'postgres', host: steps[0] === 'environment-loaded' ? 'loaded-after-env' : 'stale-before-env',
          port: 5432, username: 'test', password: 'test', database: 'test', entities: [],
        };
      },
    );

    expect(steps).toEqual(['environment-loaded', 'options-created']);
    expect(source.options).toMatchObject({ host: 'loaded-after-env', synchronize: false, migrationsRun: false, installExtensions: false });
  });
});
