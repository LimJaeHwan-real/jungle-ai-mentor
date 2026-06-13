import crypto from 'crypto';
import pg from 'pg';

const { Client } = pg;

const client = new Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5433),
  user: process.env.DB_USER ?? 'jungle',
  password: process.env.DB_PASSWORD ?? 'jungle',
  database: process.env.DB_NAME ?? 'jungle_ai_mentor',
});

const embeddingDimension = 1536;

function splitText(content) {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunkSize = 700;
  const chunkOverlap = 120;
  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    const hardEnd = Math.min(start + chunkSize, normalized.length);
    const slice = normalized.slice(start, hardEnd);
    const paragraphBreak = slice.lastIndexOf('\n\n');
    const sentenceBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
    const candidate = paragraphBreak > chunkSize * 0.45 ? paragraphBreak : sentenceBreak > chunkSize * 0.45 ? sentenceBreak + 1 : slice.length;
    const softEnd = hardEnd === normalized.length ? hardEnd : start + candidate;

    chunks.push(normalized.slice(start, softEnd).trim());
    if (softEnd >= normalized.length) break;
    start = Math.max(softEnd - chunkOverlap, start + 1);
  }

  return chunks.filter(Boolean);
}

function toPostContent(post) {
  const tags = post.tags ?? [];
  return [
    `게시글 제목: ${post.title}`,
    `작성자: ${post.nickname ?? '알 수 없음'}`,
    `게시글 유형: ${post.type}`,
    `카테고리: ${post.category}`,
    tags.length ? `태그: ${tags.map((tag) => `#${tag}`).join(', ')}` : '',
    '',
    post.content,
  ]
    .filter(Boolean)
    .join('\n');
}

function mockEmbedding(text) {
  const vector = new Array(embeddingDimension).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens.length ? tokens : [text]) {
    const hash = crypto.createHash('sha256').update(token).digest();
    for (let i = 0; i < hash.length; i += 1) {
      const index = (hash[i] + i * 31) % embeddingDimension;
      vector[index] += 1;
    }
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

function toSqlVector(embedding) {
  return `[${embedding.slice(0, embeddingDimension).join(',')}]`;
}

async function upsertDocument(post) {
  const sourceUrl = `app://posts/${post.id}`;
  const content = toPostContent(post);
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');
  const existing = await client.query('SELECT id, "contentHash" FROM documents WHERE "sourceUrl" = $1', [sourceUrl]);

  if (existing.rows[0]?.contentHash === contentHash) {
    return 'skipped';
  }

  const documentResult = existing.rows[0]
    ? await client.query(
        `
        UPDATE documents
        SET title = $2, content = $3, category = 'BOARD_POST', "sourceType" = 'BOARD_POST', "contentHash" = $4, "updatedAt" = NOW()
        WHERE id = $1
        RETURNING id
        `,
        [existing.rows[0].id, `[게시판] ${post.title}`, content, contentHash],
      )
    : await client.query(
        `
        INSERT INTO documents (id, title, content, category, "sourceType", "sourceUrl", "contentHash", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1, $2, 'BOARD_POST', 'BOARD_POST', $3, $4, NOW(), NOW())
        RETURNING id
        `,
        [`[게시판] ${post.title}`, content, sourceUrl, contentHash],
      );

  const documentId = documentResult.rows[0].id;
  await client.query('DELETE FROM document_chunks WHERE "documentId" = $1', [documentId]);

  const chunks = splitText(content);
  for (let index = 0; index < chunks.length; index += 1) {
    const embedding = toSqlVector(mockEmbedding(chunks[index]));
    await client.query(
      `
      INSERT INTO document_chunks (id, "documentId", "chunkIndex", "chunkText", "tokenCount", embedding, "createdAt")
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, NOW())
      `,
      [documentId, index, chunks[index], Math.ceil(chunks[index].length / 4), embedding],
    );
  }

  return existing.rows[0] ? 'updated' : 'created';
}

async function main() {
  await client.connect();
  try {
    const result = await client.query(
      `
      SELECT
        p.id,
        p.title,
        p.content,
        p.type,
        p.category,
        u.nickname,
        COALESCE(array_agg(t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
      FROM posts p
      LEFT JOIN users u ON u.id = p."userId"
      LEFT JOIN post_tags pt ON pt."postId" = p.id
      LEFT JOIN tags t ON t.id = pt."tagId"
      GROUP BY p.id, u.nickname
      ORDER BY p."createdAt" DESC
      `,
    );

    const summary = { created: 0, updated: 0, skipped: 0 };
    for (const post of result.rows) {
      const status = await upsertDocument(post);
      summary[status] += 1;
    }

    console.log(JSON.stringify({ postCount: result.rowCount, ...summary }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
