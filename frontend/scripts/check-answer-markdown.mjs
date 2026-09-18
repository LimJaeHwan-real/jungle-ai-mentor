import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  // The short-lived test server does not need to scan index.html in the background.
  optimizeDeps: { noDiscovery: true },
});

try {
  const { AnswerMarkdown } = await server.ssrLoadModule('/src/components/AnswerMarkdown.tsx');
  const render = (answer, references) => renderToStaticMarkup(
    React.createElement(AnswerMarkdown, { answer, references }),
  );

  await test('질문 및 FAQ 답변의 Markdown 제목·목록·표·코드를 표시한다', () => {
    const html = render('## 안내\n\n- 첫째\n\n| 단계 | 설명 |\n| --- | --- |\n| 1 | 시작 |\n\n`코드`');
    assert.match(html, /<h2>안내<\/h2>/);
    assert.match(html, /<li>첫째<\/li>/);
    assert.match(html, /<table>/);
    assert.match(html, /<code>코드<\/code>/);
  });

  await test('실제 인용 위치를 출처 링크로 표시한다', () => {
    const answer = '블로그 후기 [1]';
    const startIndex = answer.indexOf('[1]');
    const html = render(answer, [
      { startIndex, endIndex: startIndex + 3, sourceUrl: 'https://example.org/blog/one' },
      { startIndex, endIndex: startIndex + 3, sourceUrl: 'https://example.org/blog/two' },
    ]);
    assert.match(html, /href="https:\/\/example\.org\/blog\/one"/);
    assert.match(html, /href="https:\/\/example\.org\/blog\/two"/);
    assert.match(html, /rel="noopener noreferrer"/);
  });

  await test('외부 이미지와 HTML, 실행 가능한 주소를 렌더링하지 않는다', () => {
    const html = render('![그림](https://example.org/track.png) <script>alert(1)</script> [링크](javascript:alert(1))');
    assert.doesNotMatch(html, /<img|<script|href="javascript:/);
    assert.match(html, /그림/);
  });
} finally {
  await server.close();
}
