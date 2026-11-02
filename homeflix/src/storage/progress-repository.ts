import type { KeyValueStore } from './kv-store';

/**
 * Histórico e posição de reprodução por vídeo (filme ou episódio).
 *
 * - Um registro por vídeo, numa chave própria ("homeflix.progress.v1:<id>"):
 *   gravações pequenas e independentes, sem risco de corromper o histórico todo.
 * - O ID do vídeo vem do servidor e é estável (hash do caminho), então
 *   reescanear a biblioteca não apaga o histórico.
 * - `updatedAt` e `revision` permitem, no futuro, sincronizar com o backend
 *   (última escrita vence) sem mudar o formato.
 */

export const PROGRESS_PREFIX = 'homeflix.progress.v1:';

/** Abaixo disso não vale oferecer "continuar" (o usuário mal começou). */
export const MIN_RESUME_SECONDS = 10;
export const DEFAULT_WATCHED_THRESHOLD = 0.9;
const MAX_RECORDS = 1000;

export interface ProgressMeta {
  readonly title: string;
  readonly seriesId: string | null;
  readonly season: number | null;
  readonly episode: number | null;
}

export interface ProgressRecord extends ProgressMeta {
  readonly videoId: string;
  readonly positionSec: number;
  readonly durationSec: number | null;
  /** Epoch em ms da última reprodução. */
  readonly updatedAt: number;
  readonly watched: boolean;
  readonly watchedAt: number | null;
  readonly revision: number;
}

export interface SaveInput {
  readonly videoId: string;
  readonly positionSec: number;
  readonly durationSec: number | null;
  readonly meta: ProgressMeta;
}

export class ProgressRepository {
  private watchedThreshold: number;

  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = Date.now,
    watchedThreshold: number = DEFAULT_WATCHED_THRESHOLD,
  ) {
    this.watchedThreshold = watchedThreshold;
  }

  setWatchedThreshold(threshold: number): void {
    this.watchedThreshold = threshold;
  }

  get(videoId: string): ProgressRecord | null {
    return parseRecord(this.store.get(PROGRESS_PREFIX + videoId));
  }

  list(): ProgressRecord[] {
    return this.store
      .keys(PROGRESS_PREFIX)
      .map((key) => parseRecord(this.store.get(key)))
      .filter((record): record is ProgressRecord => record !== null);
  }

  /** Grava a posição atual. Ao passar do limite (90%), o vídeo passa a contar como assistido. */
  save(input: SaveInput): ProgressRecord {
    const previous = this.get(input.videoId);
    const durationSec = validDuration(input.durationSec) ?? previous?.durationSec ?? null;
    const positionSec = clampPosition(input.positionSec, durationSec);
    const reachedEnd = durationSec !== null && positionSec >= durationSec * this.watchedThreshold;
    const now = this.now();

    const record: ProgressRecord = {
      videoId: input.videoId,
      ...input.meta,
      positionSec,
      durationSec,
      updatedAt: now,
      watched: reachedEnd || (previous?.watched ?? false),
      watchedAt: reachedEnd ? (previous?.watched ? (previous.watchedAt ?? now) : now) : (previous?.watchedAt ?? null),
      revision: (previous?.revision ?? 0) + 1,
    };
    this.write(record);
    return record;
  }

  markWatched(videoId: string, meta: ProgressMeta, durationSec: number | null = null): ProgressRecord {
    const previous = this.get(videoId);
    const now = this.now();
    const duration = validDuration(durationSec) ?? previous?.durationSec ?? null;
    const record: ProgressRecord = {
      videoId,
      ...meta,
      positionSec: duration ?? previous?.positionSec ?? 0,
      durationSec: duration,
      updatedAt: now,
      watched: true,
      watchedAt: now,
      revision: (previous?.revision ?? 0) + 1,
    };
    this.write(record);
    return record;
  }

  markUnwatched(videoId: string): void {
    this.store.remove(PROGRESS_PREFIX + videoId);
  }

  clearAll(): void {
    for (const key of this.store.keys(PROGRESS_PREFIX)) this.store.remove(key);
  }

  /** Está no meio: vale oferecer "continuar de onde parou". */
  isInProgress(record: ProgressRecord | null): record is ProgressRecord {
    if (!record || record.positionSec < MIN_RESUME_SECONDS) return false;
    if (record.durationSec === null) return true;
    return record.positionSec < record.durationSec * this.watchedThreshold;
  }

  /** Fração assistida (0..1) para barras de progresso; null quando não se sabe a duração. */
  fraction(record: ProgressRecord | null): number | null {
    if (!record || record.durationSec === null || record.durationSec <= 0) return null;
    return Math.min(1, Math.max(0, record.positionSec / record.durationSec));
  }

  /** Posição para retomar (0 quando não há o que continuar). */
  resumePosition(videoId: string): number {
    const record = this.get(videoId);
    return this.isInProgress(record) ? record.positionSec : 0;
  }

  private write(record: ProgressRecord): void {
    try {
      this.store.set(PROGRESS_PREFIX + record.videoId, JSON.stringify(record));
    } catch {
      // Cota cheia: descarta os registros mais antigos e tenta de novo.
      this.prune(Math.floor(MAX_RECORDS / 2));
      this.store.set(PROGRESS_PREFIX + record.videoId, JSON.stringify(record));
    }
    if (record.revision % 50 === 1) this.prune(MAX_RECORDS);
  }

  private prune(keep: number): void {
    const records = this.list().sort((a, b) => b.updatedAt - a.updatedAt);
    for (const old of records.slice(keep)) this.store.remove(PROGRESS_PREFIX + old.videoId);
  }
}

function validDuration(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

function clampPosition(position: number, duration: number | null): number {
  const safe = Number.isFinite(position) && position > 0 ? position : 0;
  const clamped = duration === null ? safe : Math.min(safe, duration);
  return Math.round(clamped * 10) / 10;
}

function parseRecord(raw: string | null): ProgressRecord | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<ProgressRecord>;
    if (typeof value.videoId !== 'string' || typeof value.positionSec !== 'number' || typeof value.updatedAt !== 'number') {
      return null;
    }
    return {
      videoId: value.videoId,
      title: typeof value.title === 'string' ? value.title : '',
      seriesId: value.seriesId ?? null,
      season: value.season ?? null,
      episode: value.episode ?? null,
      positionSec: value.positionSec,
      durationSec: typeof value.durationSec === 'number' ? value.durationSec : null,
      updatedAt: value.updatedAt,
      watched: value.watched === true,
      watchedAt: typeof value.watchedAt === 'number' ? value.watchedAt : null,
      revision: typeof value.revision === 'number' ? value.revision : 1,
    };
  } catch {
    return null; // registro corrompido é ignorado, sem derrubar o app
  }
}
