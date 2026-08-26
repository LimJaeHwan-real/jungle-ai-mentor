const qualify = (tableAlias: string | undefined, column: string) => (tableAlias ? `${tableAlias}.${column}` : column);

export const chunkTextFtsExpression = (tableAlias?: string) =>
  `to_tsvector('simple', coalesce(${qualify(tableAlias, '"chunkText"')}, ''))`;

export const documentTitleFtsExpression = (tableAlias?: string) =>
  `to_tsvector('simple', coalesce(${qualify(tableAlias, 'title')}, ''))`;
