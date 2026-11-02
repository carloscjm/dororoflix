import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors/app-error.js';
import { isPathInside, resolveInsideRoot } from '../src/library/path-safety.js';
import { isLocalNetworkAddress } from '../src/plugins/lan-guard.js';

const root = path.resolve('biblioteca', 'Filmes');

describe('proteção contra path traversal', () => {
  it('aceita caminhos dentro da raiz', () => {
    expect(resolveInsideRoot(root, 'Séries/ep1.mkv')).toBe(path.join(root, 'Séries', 'ep1.mkv'));
    expect(resolveInsideRoot(root, 'a/../b.mp4')).toBe(path.join(root, 'b.mp4'));
  });

  it.each([
    ['../fora.mp4'],
    ['Séries/../../fora.mp4'],
    ['..'],
    ['.'],
    [''],
    ['a\0.mp4'],
    ['/etc/passwd'],
    ['C:/Windows/win.ini'],
    ['C:\\Windows\\win.ini'],
    ['\\\\servidor\\share\\x.mp4'],
  ])('rejeita %j', (relativePath) => {
    expect(() => resolveInsideRoot(root, relativePath)).toThrow(AppError);
  });

  it('não confunde nomes que começam com ".."', () => {
    expect(isPathInside(root, path.join(root, '..filme.mp4'))).toBe(true);
    expect(isPathInside(root, `${root}-irmao${path.sep}x.mp4`)).toBe(false);
    expect(isPathInside(root, root)).toBe(false);
  });
});

describe('isLocalNetworkAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.10',
    '172.31.255.255',
    '192.168.0.15',
    '169.254.1.1',
    '::1',
    '::ffff:192.168.1.20',
    'fd12:3456::1',
    'fe80::1%eth0',
  ])('%s é local', (ip) => {
    expect(isLocalNetworkAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '100.64.0.1', '2001:4860:4860::8888', '::ffff:8.8.8.8', 'lixo', undefined])(
    '%s não é local',
    (ip) => {
      expect(isLocalNetworkAddress(ip)).toBe(false);
    },
  );
});
