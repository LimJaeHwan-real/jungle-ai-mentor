import { PassThrough } from 'node:stream';
import { readHiddenInput } from './hidden-input';

function terminal() {
  const input = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(input, { isTTY: true, isRaw: false, setRawMode: jest.fn() });
  const output = { isTTY: true, write: jest.fn() } as unknown as NodeJS.WriteStream;
  return { input, output };
}

describe('관리자 명령의 비표시 입력', () => {
  it('입력값은 화면에 쓰지 않고 완료 후 터미널을 복구한다', async () => {
    const { input, output } = terminal();
    const value = readHiddenInput('Password: ', input, output);
    input.emit('keypress', 'synthetic-secret', {});
    input.emit('keypress', undefined, { name: 'return' });
    await expect(value).resolves.toBe('synthetic-secret');
    expect(output.write).toHaveBeenCalledTimes(2);
    expect(output.write).toHaveBeenNthCalledWith(1, 'Password: ');
    expect(output.write).toHaveBeenNthCalledWith(2, '\n');
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(input.listenerCount('keypress')).toBe(0);
  });

  it('취소와 입력 종료는 값을 반환하지 않고 터미널을 복구한다', async () => {
    for (const event of ['cancel', 'end', 'error']) {
      const { input, output } = terminal();
      const value = readHiddenInput('Password: ', input, output);
      input.emit('keypress', 'synthetic-secret', {});
      if (event === 'cancel') input.emit('keypress', undefined, { name: 'c', ctrl: true });
      else input.emit(event);
      await expect(value).rejects.toThrow('input cancelled');
      expect(input.setRawMode).toHaveBeenLastCalledWith(false);
      expect(input.listenerCount('keypress')).toBe(0);
    }
  });

  it('파이프 입력은 거부한다', async () => {
    const { input, output } = terminal();
    Object.assign(input, { isTTY: false });
    await expect(readHiddenInput('Password: ', input, output)).rejects.toThrow('interactive terminal required');
    expect(output.write).not.toHaveBeenCalled();
  });
});
