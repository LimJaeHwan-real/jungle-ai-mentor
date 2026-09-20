import { createDataSourceOptions } from './data-source';

describe('데이터 소스 옵션', () => {
  it('전달받은 늦게 적재된 환경 값을 DB 연결 옵션에 사용한다', () => {
    const options = createDataSourceOptions({
      DB_HOST: 'loaded-db-host', DB_PORT: '5544', DB_USER: 'loaded-user', DB_PASSWORD: 'masked', DB_NAME: 'loaded-db',
    });

    expect(options).toMatchObject({ host: 'loaded-db-host', port: 5544, username: 'loaded-user', database: 'loaded-db', synchronize: false });
  });
});
