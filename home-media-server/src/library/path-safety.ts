import path from 'node:path';
import { forbiddenPath } from '../errors/app-error.js';

/** Indica se `target` está estritamente dentro de `root` (a própria raiz não conta). */
export function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative) // no Windows, outro drive gera caminho absoluto
  );
}

/**
 * Resolve um caminho relativo (com separadores "/") dentro da raiz,
 * rejeitando qualquer tentativa de sair dela (path traversal).
 */
export function resolveInsideRoot(root: string, relativePath: string): string {
  if (relativePath.length === 0 || relativePath.includes('\0')) throw forbiddenPath();
  // Caminhos absolutos (POSIX "/x" ou Windows "C:\x", "\\servidor\x") nunca são aceitos.
  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) throw forbiddenPath();

  const absolute = path.resolve(root, ...relativePath.split('/'));
  if (!isPathInside(root, absolute)) throw forbiddenPath();

  return absolute;
}

/** Converte um caminho relativo nativo para o formato com "/" usado na API. */
export function toPosixPath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}
