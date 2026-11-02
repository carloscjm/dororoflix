import { createHash } from 'node:crypto';

export const VIDEO_ID_PATTERN = '^[a-f0-9]{16}$';

/**
 * Gera um identificador estável a partir da origem + caminho relativo.
 *
 * - O mesmo arquivo gera sempre o mesmo ID entre scans e reinícios do servidor.
 * - No Windows (sistema de arquivos sem distinção de maiúsculas), o caminho é
 *   normalizado para minúsculas, então renomear só a caixa não muda o ID.
 * - Mover ou renomear o arquivo gera um ID novo (limitação documentada no README).
 */
export function createVideoId(
  sourceId: string,
  relativePath: string,
  caseInsensitive: boolean = process.platform === 'win32',
): string {
  let key = relativePath.normalize('NFC');
  if (caseInsensitive) key = key.toLowerCase();

  return createHash('sha256').update(`${sourceId}:${key}`).digest('hex').slice(0, 16);
}

/**
 * ID estável no mesmo formato dos vídeos para outras entidades (séries, legendas).
 * O `namespace` evita colisão entre tipos diferentes com a mesma chave.
 */
export function createStableId(namespace: string, key: string): string {
  return createHash('sha256').update(`${namespace}|${key.normalize('NFC')}`).digest('hex').slice(0, 16);
}
