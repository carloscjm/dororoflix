import fs from 'node:fs/promises';
import { z } from 'zod';
import type { Classification } from './media-classifier.js';

/**
 * Correções manuais de metadados, lidas de um arquivo JSON opcional
 * (`METADATA_OVERRIDES_FILE`). A chave é o caminho relativo do vídeo (com "/")
 * ou o seu ID. O arquivo é relido a cada scan, então basta editá-lo e chamar
 * `POST /api/library/scan`.
 *
 * {
 *   "videos": {
 *     "Series/Minha Serie/extra.mkv": { "kind": "episode", "seriesTitle": "Minha Série", "season": 1, "episode": 7 },
 *     "8f3bf34f71f17c24": { "kind": "movie", "title": "Esqueceram de Mim" }
 *   }
 * }
 */

const overrideSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('movie'), title: z.string().trim().min(1).optional() }),
  z.object({
    kind: z.literal('episode'),
    seriesTitle: z.string().trim().min(1),
    season: z.number().int().min(0).max(999),
    episode: z.number().int().min(0).max(9999),
    episodeTitle: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
  }),
]);

const fileSchema = z.object({ videos: z.record(z.string(), overrideSchema).default({}) });

export type MetadataOverride = z.infer<typeof overrideSchema>;

export interface MetadataOverrides {
  /** Procura uma correção pelo ID ou pelo caminho relativo do vídeo. */
  find(videoId: string, relativePath: string): MetadataOverride | undefined;
}

export const NO_OVERRIDES: MetadataOverrides = { find: () => undefined };

export function overridesFromObject(raw: unknown): MetadataOverrides {
  const parsed = fileSchema.parse(raw);
  const byKey = new Map<string, MetadataOverride>();
  for (const [key, value] of Object.entries(parsed.videos)) {
    byKey.set(key.normalize('NFC').toLowerCase(), value);
  }
  return {
    find: (videoId, relativePath) =>
      byKey.get(videoId) ?? byKey.get(relativePath.normalize('NFC').toLowerCase()),
  };
}

/** Carrega o arquivo de correções; ausente ou inválido = sem correções (com aviso no log). */
export async function loadOverridesFile(
  filePath: string | null,
  warn: (details: object, message: string) => void,
): Promise<MetadataOverrides> {
  if (filePath === null) return NO_OVERRIDES;
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return overridesFromObject(JSON.parse(content.replace(/^﻿/, '')));
  } catch (error) {
    warn({ err: error, filePath }, 'Arquivo de correções de metadados ignorado (ausente ou inválido)');
    return NO_OVERRIDES;
  }
}

export function applyOverride(base: Classification, override: MetadataOverride | undefined): Classification {
  if (override === undefined) return base;
  if (override.kind === 'movie') return { kind: 'movie' };
  return {
    kind: 'episode',
    seriesTitle: override.seriesTitle,
    season: override.season,
    episode: override.episode,
    episodeTitle: override.episodeTitle ?? null,
    seriesFolder: base.kind === 'episode' ? base.seriesFolder : null,
  };
}
