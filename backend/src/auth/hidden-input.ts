import { emitKeypressEvents } from 'node:readline';

export function readHiddenInput(
  prompt: string,
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): Promise<string> {
  if (!input.isTTY || !output.isTTY) return Promise.reject(new Error('interactive terminal required'));
  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = input.isRaw;
    const wasPaused = input.isPaused();
    const finish = (cancelled: boolean) => {
      input.removeListener('keypress', onKey);
      input.removeListener('end', onEnd);
      input.removeListener('error', onEnd);
      input.setRawMode(wasRaw);
      if (wasPaused) input.pause();
      output.write('\n');
      if (cancelled) { value = ''; reject(new Error('input cancelled')); }
      else resolve(value);
    };
    const onEnd = () => finish(true);
    const onKey = (text: string | undefined, key: { name?: string; ctrl?: boolean; meta?: boolean } = {}) => {
      if ((key.ctrl && (key.name === 'c' || key.name === 'd')) || key.name === 'escape') return finish(true);
      if (key.name === 'return' || key.name === 'enter') return finish(false);
      if (key.name === 'backspace') { value = [...value].slice(0, -1).join(''); return; }
      if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text)) value += text;
    };
    emitKeypressEvents(input);
    input.setRawMode(true);
    input.on('keypress', onKey);
    input.once('end', onEnd);
    input.once('error', onEnd);
    output.write(prompt);
    input.resume();
  });
}
