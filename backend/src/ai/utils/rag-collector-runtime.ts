import { DataSource, DataSourceOptions } from 'typeorm';

export async function createReadOnlyCollectorDataSource(
  loadEnvironment: () => void,
  loadDataSourceOptions: () => Promise<DataSourceOptions>,
) {
  loadEnvironment();
  const options = await loadDataSourceOptions();
  return new DataSource({ ...options, synchronize: false, migrationsRun: false, installExtensions: false } as DataSourceOptions);
}
