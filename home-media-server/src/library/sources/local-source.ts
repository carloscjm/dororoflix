import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyBaseLogger } from 'fastify';
import { fileMissing, fileTooLarge, forbiddenPath, isNodeError } from '../../errors/app-error.js';
import { isLibraryFile } from '../formats.js';
import { isPathInside, resolveInsideRoot, toPosixPath } from '../path-safety.js';
import type { ByteRange, DiscoveredFile, FileInfo, MediaSource } from '../types.js';

const MISSING_FILE_CODES = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

/**
 * Origem de mídia baseada em uma pasta do disco local.
 * Apenas leitura: nenhum método cria, altera, move ou exclui arquivos.
 */
export class LocalFileSource implements MediaSource {
  readonly id = 'local';

  private constructor(
    /** Raiz já resolvida com realpath (sem links simbólicos). */
    private readonly root: string,
    private readonly logger: FastifyBaseLogger,
  ) {}

  /** Valida a pasta raiz e cria a origem. Falha cedo com mensagem clara. */
  static async create(root: string, logger: FastifyBaseLogger): Promise<LocalFileSource> {
    let realRoot: string;
    try {
      realRoot = await fs.realpath(root);
    } catch (error) {
      throw new Error(
        `MEDIA_ROOT "${root}" não existe ou não pode ser acessado. Verifique o caminho e se o drive está conectado.`,
        { cause: error },
      );
    }

    const stats = await fs.stat(realRoot);
    if (!stats.isDirectory()) throw new Error(`MEDIA_ROOT "${root}" não é uma pasta.`);

    return new LocalFileSource(realRoot, logger.child({ source: 'local' }));
  }

  async scan(): Promise<DiscoveredFile[]> {
    const found: DiscoveredFile[] = [];
    await this.walk(this.root, found);
    return found;
  }

  async stat(relativePath: string): Promise<FileInfo> {
    const absolute = await this.resolveSafe(relativePath);
    const stats = await fs.stat(absolute);
    if (!stats.isFile()) throw fileMissing();
    return { sizeBytes: stats.size, modifiedAt: stats.mtime };
  }

  async openStream(relativePath: string, range?: ByteRange): Promise<Readable> {
    const absolute = await this.resolveSafe(relativePath);
    // highWaterMark de 256 KiB reduz syscalls sem manter muito dado em memória.
    const options = { highWaterMark: 256 * 1024, ...(range ? { start: range.start, end: range.end } : {}) };
    return createReadStream(absolute, options);
  }

  async readFile(relativePath: string, maxBytes: number): Promise<Buffer> {
    const absolute = await this.resolveSafe(relativePath);
    const stats = await fs.stat(absolute);
    if (!stats.isFile()) throw fileMissing();
    if (stats.size > maxBytes) throw fileTooLarge(maxBytes);
    return fs.readFile(absolute);
  }

  /**
   * Resolve o caminho e confirma — após seguir links/junctions — que o arquivo
   * real continua dentro da raiz. Defesa em profundidade contra path traversal.
   */
  private async resolveSafe(relativePath: string): Promise<string> {
    const absolute = resolveInsideRoot(this.root, relativePath);

    let real: string;
    try {
      real = await fs.realpath(absolute);
    } catch (error) {
      if (isNodeError(error) && error.code !== undefined && MISSING_FILE_CODES.has(error.code)) {
        throw fileMissing(error);
      }
      throw error;
    }

    if (!isPathInside(this.root, real)) throw forbiddenPath();
    return real;
  }

  private async walk(directory: string, found: DiscoveredFile[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      // Pastas sem permissão (ex.: pastas de sistema) não interrompem o scan.
      this.logger.warn({ err: error, directory }, 'Não foi possível ler a pasta; ignorando');
      return;
    }

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);

      // Links simbólicos e junctions são ignorados para não sair da raiz.
      if (entry.isSymbolicLink()) {
        this.logger.debug({ path: absolute }, 'Link simbólico ignorado');
        continue;
      }

      if (entry.isDirectory()) {
        await this.walk(absolute, found);
        continue;
      }

      if (!entry.isFile() || !isLibraryFile(entry.name)) continue;

      try {
        const stats = await fs.stat(absolute);
        found.push({
          relativePath: toPosixPath(path.relative(this.root, absolute)),
          sizeBytes: stats.size,
          modifiedAt: stats.mtime,
        });
      } catch (error) {
        this.logger.warn({ err: error, path: absolute }, 'Não foi possível ler o arquivo; ignorando');
      }
    }
  }
}
