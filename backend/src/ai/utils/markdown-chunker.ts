import { getEncoding } from 'js-tiktoken';

const encoding = getEncoding('cl100k_base');
export const RAG_CHUNKING_VERSION = 'markdown-cl100k-256-v2';

export interface MarkdownChunk {
  chunkText: string;
  sectionPath?: string;
  sourceStart: number;
  sourceEnd: number;
  tokenCount: number;
}

interface Line {
  start: number;
  end: number;
  text: string;
}

interface Block {
  start: number;
  end: number;
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'code';
}

export function countEmbeddingTokens(text: string): number {
  return encoding.encode(text, [], []).length;
}

function linesInRange(content: string, start: number, end: number): Line[] {
  const lines: Line[] = [];
  let cursor = start;
  while (cursor < end) {
    let textEnd = cursor;
    while (textEnd < end && content[textEnd] !== '\n' && content[textEnd] !== '\r') textEnd += 1;
    let next = textEnd;
    if (content[next] === '\r' && content[next + 1] === '\n') next += 2;
    else if (content[next] === '\r' || content[next] === '\n') next += 1;
    lines.push({ start: cursor, end: textEnd, text: content.slice(cursor, textEnd) });
    cursor = next;
  }
  return lines;
}

function trimRange(content: string, start: number, end: number) {
  while (start < end && /\s/u.test(content[start])) start += 1;
  while (end > start && /\s/u.test(content[end - 1])) end -= 1;
  return { start, end };
}

function isHeading(line: string) { return /^ {0,3}#{1,6}\s+\S/u.test(line); }
function isFence(line: string) { return /^ {0,3}(`{3,}|~{3,})/u.exec(line); }
function isClosingFence(line: string, fence: string) {
  return new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`, 'u').test(line);
}
function isList(line: string) { return /^\s*(?:[-*+]|\d+[.)])\s+\S/u.test(line); }
function isTableSeparator(line: string) { return /^\s*\|?\s*:?-{3,}:?\s*\|/u.test(line); }

function parseBlocks(content: string, start: number, end: number): Block[] {
  const lines = linesInRange(content, start, end);
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.text.trim()) { index += 1; continue; }
    const first = index;
    let type: Block['type'] = 'paragraph';
    if (isHeading(line.text)) {
      type = 'heading';
      index += 1;
    } else if (isFence(line.text)) {
      type = 'code';
      const fence = isFence(line.text)![1];
      index += 1;
      while (index < lines.length) {
        const closing = isClosingFence(lines[index].text, fence);
        index += 1;
        if (closing) break;
      }
    } else if (line.text.includes('|') && isTableSeparator(lines[index + 1]?.text ?? '')) {
      type = 'table';
      index += 2;
      while (index < lines.length && lines[index].text.includes('|') && lines[index].text.trim()) index += 1;
    } else if (isList(line.text)) {
      type = 'list';
      index += 1;
      while (index < lines.length && lines[index].text.trim()
        && (isList(lines[index].text) || /^\s{2,}\S/u.test(lines[index].text))) index += 1;
    } else {
      index += 1;
      while (index < lines.length && lines[index].text.trim()
        && !isHeading(lines[index].text) && !isFence(lines[index].text)
        && !isList(lines[index].text)
        && !(lines[index].text.includes('|') && isTableSeparator(lines[index + 1]?.text ?? ''))) index += 1;
    }
    const range = trimRange(content, lines[first].start, lines[index - 1].end);
    if (range.start < range.end) blocks.push({ ...range, type });
  }
  return blocks;
}

function largestFittingEnd(content: string, start: number, end: number, maxTokens: number): number {
  let low = start + 1;
  let high = end;
  let best = start + 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (countEmbeddingTokens(content.slice(start, middle)) <= maxTokens) {
      best = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  while (best > start + 1 && countEmbeddingTokens(content.slice(start, best)) > maxTokens) best -= 1;
  if (best < end && /[\uD800-\uDBFF]/u.test(content[best - 1]) && /[\uDC00-\uDFFF]/u.test(content[best])) best -= 1;
  return best;
}

function preferredEnd(content: string, start: number, best: number, type: Block['type']): number {
  const text = content.slice(start, best);
  const newline = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'));
  if (newline >= Math.floor(text.length / 2)) return start + newline + 1;
  if (type === 'code' || type === 'table' || type === 'list') return best;
  const sentence = [...text.matchAll(/[.!?。]\s+/gu)].at(-1);
  if (sentence && sentence.index! >= Math.floor(text.length / 2)) return start + sentence.index! + sentence[0].length;
  const space = text.lastIndexOf(' ');
  return space >= Math.floor(text.length / 2) ? start + space + 1 : best;
}

function splitOversizedBlock(content: string, block: Block, maxTokens: number): Array<{ start: number; end: number }> {
  const pieces: Array<{ start: number; end: number }> = [];
  let start = block.start;
  while (start < block.end) {
    const remaining = trimRange(content, start, block.end);
    if (remaining.start >= remaining.end) break;
    start = remaining.start;
    if (countEmbeddingTokens(content.slice(start, block.end)) <= maxTokens) {
      pieces.push({ start, end: block.end });
      break;
    }
    const fittingEnd = largestFittingEnd(content, start, block.end, maxTokens);
    const candidate = preferredEnd(content, start, fittingEnd, block.type);
    const range = trimRange(content, start, candidate);
    if (range.end > range.start) pieces.push(range);
    start = Math.max(candidate, start + 1);
  }
  return pieces;
}

function overlapStart(content: string, block: Block, nextEnd: number, maxTokens: number): number | undefined {
  if (block.type !== 'paragraph') return undefined;
  const text = content.slice(block.start, block.end);
  const boundaries = [...text.matchAll(/[.!?。]\s+/gu)].map((match) => match.index! + match[0].length);
  const starts = [block.start, ...boundaries.map((offset) => block.start + offset)].filter((start) => start < block.end);
  const start = starts.at(-1);
  if (start === undefined || countEmbeddingTokens(content.slice(start, block.end)) > 32) return undefined;
  return countEmbeddingTokens(content.slice(start, nextEnd)) <= maxTokens ? start : undefined;
}

export function chunkMarkdown(content: string, maxTokens = 256): MarkdownChunk[] {
  if (!Number.isInteger(maxTokens) || maxTokens < 1) throw new Error('chunk 토큰 제한은 양의 정수여야 합니다.');
  if (!content.trim()) return [];

  const lines = linesInRange(content, 0, content.length);
  const headings: Array<{ start: number; level: number; title: string }> = [];
  let activeFence: string | undefined;
  for (const line of lines) {
    if (activeFence) {
      if (isClosingFence(line.text, activeFence)) activeFence = undefined;
      continue;
    }
    const opening = isFence(line.text);
    if (opening) { activeFence = opening[1]; continue; }
    if (isHeading(line.text)) {
      const match = /^ {0,3}(#{1,6})\s+(.+)$/u.exec(line.text)!;
      headings.push({ start: line.start, level: match[1].length, title: match[2].trim() });
    }
  }
  const boundaries = [...new Set([0, ...headings.map((heading) => heading.start), content.length])].sort((a, b) => a - b);
  const chunks: MarkdownChunk[] = [];
  const path: string[] = [];

  for (let section = 0; section < boundaries.length - 1; section += 1) {
    const sectionStart = boundaries[section];
    const heading = headings.find((item) => item.start === sectionStart);
    if (heading) {
      path.splice(heading.level - 1);
      path[heading.level - 1] = heading.title;
    }
    const sectionPath = path.filter(Boolean).join(' > ') || undefined;
    const blocks = parseBlocks(content, sectionStart, boundaries[section + 1]);
    let current: { start: number; end: number; lastBlock: Block } | undefined;

    const append = (start: number, end: number) => {
      const range = trimRange(content, start, end);
      if (range.start >= range.end) return;
      const chunkText = content.slice(range.start, range.end);
      if (isHeading(chunkText) && !chunkText.includes('\n') && !chunkText.includes('\r')) return;
      chunks.push({ chunkText, sectionPath, sourceStart: range.start, sourceEnd: range.end, tokenCount: countEmbeddingTokens(chunkText) });
    };

    for (const block of blocks) {
      if (!current) {
        if (countEmbeddingTokens(content.slice(block.start, block.end)) > maxTokens) {
          for (const piece of splitOversizedBlock(content, block, maxTokens)) append(piece.start, piece.end);
        } else current = { start: block.start, end: block.end, lastBlock: block };
        continue;
      }
      if (countEmbeddingTokens(content.slice(current.start, block.end)) <= maxTokens) {
        current.end = block.end;
        current.lastBlock = block;
        continue;
      }
      if (current.lastBlock.type === 'heading' && countEmbeddingTokens(content.slice(block.start, block.end)) > maxTokens) {
        for (const piece of splitOversizedBlock(content, { start: current.start, end: block.end, type: block.type }, maxTokens)) append(piece.start, piece.end);
        current = undefined;
        continue;
      }
      append(current.start, current.end);
      if (countEmbeddingTokens(content.slice(block.start, block.end)) > maxTokens) {
        for (const piece of splitOversizedBlock(content, block, maxTokens)) append(piece.start, piece.end);
        current = undefined;
      } else {
        const overlapping = overlapStart(content, current.lastBlock, block.end, maxTokens);
        current = { start: overlapping ?? block.start, end: block.end, lastBlock: block };
      }
    }
    if (current) append(current.start, current.end);
  }

  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    const key = `${chunk.sectionPath ?? ''}\u0000${chunk.chunkText.replace(/\s+/gu, ' ').trim()}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
