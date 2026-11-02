import path from 'node:path';

/**
 * Identificação de episódios a partir do caminho relativo (nomes de pastas e arquivo).
 *
 * Regras conservadoras: um vídeo só vira episódio quando há evidência clara de
 * temporada E episódio, e um nome de série pode ser determinado. Na dúvida,
 * o arquivo continua sendo um filme avulso.
 *
 * Evidências aceitas:
 * - Nome do arquivo com "S01E02" (também "S1E2", "S01.E02", "S01 E02") ou "1x02".
 * - Pasta imediata de temporada ("Temporada 1", "Season 01", "S01", "1ª Temporada",
 *   "Minha Série - Temporada 2", "Minha.Serie.S02.1080p") combinada com um número
 *   de episódio no arquivo ("E02", "Ep 2", "Episódio 02", "02 - Título").
 */

export interface EpisodeClassification {
  readonly kind: 'episode';
  readonly seriesTitle: string;
  readonly season: number;
  readonly episode: number;
  readonly episodeTitle: string | null;
  /** Pasta (relativa, com "/") que representa a série, quando houver. Usada para achar a capa. */
  readonly seriesFolder: string | null;
}

export type Classification = { readonly kind: 'movie' } | EpisodeClassification;

const MOVIE: Classification = { kind: 'movie' };

/** Pastas que só agrupam conteúdo e nunca são o nome de uma série. */
const GENERIC_FOLDERS = new Set([
  'series',
  'seriados',
  'serie',
  'tv',
  'tv shows',
  'shows',
  'filmes',
  'movies',
  'videos',
  'video',
  'downloads',
  'midia',
  'media',
  'anime',
  'animes',
  'desenhos',
  'novelas',
]);

const SEASON_EPISODE = /(?:^|[^a-z0-9])s(\d{1,2})[ ._-]?e(\d{1,3})(?![0-9])/i;
const CROSS_NOTATION = /(?:^|[^a-z0-9])(\d{1,2})x(\d{2,3})(?![0-9a-z])/i;
const EPISODE_MARKER = /(?:^|[^a-z0-9])(?:e|ep|episodio|episode|cap|capitulo)[ ._-]?(\d{1,3})(?![0-9])/i;
const LEADING_NUMBER = /^(\d{1,3})(?=[^0-9a-z]|$)/i;

const SEASON_FOLDER_EXACT = [
  /^(?:temporada|season|temp|s)\s*0*(\d{1,2})$/i,
  /^0*(\d{1,2})\s*[ªºoa°]?\s*temporada$/i,
];
const SEASON_FOLDER_WITH_PREFIX = [
  /^(.+?)[\s-]+(?:temporada|season)\s*0*(\d{1,2})(?:\s.*)?$/i,
  /^(.+?)\s+s0*(\d{1,2})(?:\s.*)?$/i,
];

/** Termos a partir dos quais o restante do nome é "lixo" de release (qualidade, codec, ano...). */
const RELEASE_NOISE =
  /(?:^|\s)(?:\(?(?:19|20)\d{2}\)?|\d{3,4}p|web|webrip|web-dl|webdl|bluray|blu-ray|brrip|bdrip|hdtv|hdrip|dvdrip|x264|x265|h264|h 264|hevc|xvid|dual|dublado|legendado|amzn|nf|10bit|ddp?\d?)(?=\s|$)/i;

/** Remove acentos e baixa a caixa para comparações. */
export function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Troca separadores de release por espaços. */
function spaced(value: string): string {
  return value.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Limpa um nome candidato a título: separadores, tags entre colchetes e ruído de release. */
export function cleanTitle(raw: string): string {
  let value = spaced(raw).replace(/^\[[^\]]*\]\s*/, '');
  const noise = RELEASE_NOISE.exec(value);
  if (noise && noise.index > 0) value = value.slice(0, noise.index);
  return value.replace(/[\s\-–([{]+$/, '').replace(/^[\s\-–)\]}]+/, '').trim();
}

interface SeasonFolder {
  readonly season: number;
  readonly seriesPrefix: string | null;
}

export function parseSeasonFolder(folderName: string): SeasonFolder | null {
  const name = spaced(folderName);
  for (const pattern of SEASON_FOLDER_EXACT) {
    const match = pattern.exec(name);
    if (match?.[1] !== undefined) return { season: Number(match[1]), seriesPrefix: null };
  }
  for (const pattern of SEASON_FOLDER_WITH_PREFIX) {
    const match = pattern.exec(name);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      const prefix = cleanTitle(match[1]);
      return { season: Number(match[2]), seriesPrefix: prefix.length > 0 ? prefix : null };
    }
  }
  return null;
}

function isGenericFolder(name: string): boolean {
  return GENERIC_FOLDERS.has(normalizeKey(name));
}

function usableFolderTitle(name: string): string | null {
  if (isGenericFolder(name)) return null;
  const title = cleanTitle(name);
  return title.length > 0 && !isGenericFolder(title) ? title : null;
}

/** Classifica um vídeo pelo caminho relativo (com "/"). */
export function classifyVideoPath(relativePath: string): Classification {
  const parts = relativePath.split('/');
  const fileName = parts.at(-1) ?? relativePath;
  const folders = parts.slice(0, -1);
  const baseName = path.posix.parse(fileName).name;

  const parentName = folders.at(-1);
  const seasonFolder = parentName === undefined ? null : parseSeasonFolder(parentName);

  let season: number;
  let episode: number;
  let filePrefix: string;
  let rest: string;

  const strong = SEASON_EPISODE.exec(baseName) ?? CROSS_NOTATION.exec(baseName);
  if (strong?.[1] !== undefined && strong[2] !== undefined) {
    season = Number(strong[1]);
    episode = Number(strong[2]);
    filePrefix = baseName.slice(0, strong.index);
    rest = baseName.slice(strong.index + strong[0].length);
  } else if (seasonFolder !== null) {
    const accentless = baseName.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const marker = EPISODE_MARKER.exec(accentless) ?? LEADING_NUMBER.exec(accentless);
    if (marker?.[1] === undefined) return MOVIE;
    season = seasonFolder.season;
    episode = Number(marker[1]);
    filePrefix = accentless.slice(0, marker.index);
    rest = accentless.slice(marker.index + marker[0].length);
  } else {
    return MOVIE;
  }

  if (episode === 0 && season === 0) return MOVIE;

  // Nome da série, da evidência mais estrutural para a menos.
  let seriesTitle: string | null = null;
  let seriesFolder: string | null = null;

  if (seasonFolder !== null) {
    if (seasonFolder.seriesPrefix !== null) {
      seriesTitle = seasonFolder.seriesPrefix;
      seriesFolder = folders.join('/');
    } else if (folders.length >= 2) {
      const candidate = usableFolderTitle(folders[folders.length - 2] ?? '');
      if (candidate !== null) {
        seriesTitle = candidate;
        seriesFolder = folders.slice(0, -1).join('/');
      }
    }
  }

  if (seriesTitle === null) {
    const fromFile = cleanTitle(filePrefix);
    if (fromFile.length > 0) seriesTitle = fromFile;
  }

  if (seriesTitle === null) {
    for (let index = folders.length - 1; index >= 0; index--) {
      const name = folders[index] ?? '';
      const asSeason = parseSeasonFolder(name);
      if (asSeason !== null && asSeason.seriesPrefix === null) continue; // "Temporada 1" não é nome de série
      const candidate = asSeason?.seriesPrefix ?? usableFolderTitle(name);
      if (candidate !== null) {
        seriesTitle = candidate;
        seriesFolder = folders.slice(0, index + 1).join('/');
        break;
      }
    }
  }

  if (seriesTitle === null) return MOVIE; // sem nome de série: evidência insuficiente

  const episodeTitle = cleanTitle(rest.replace(/^[\s._-]*(?:e\d{1,3}[\s._-]*)*/i, ''));

  return {
    kind: 'episode',
    seriesTitle,
    season,
    episode,
    episodeTitle: episodeTitle.length > 0 ? episodeTitle : null,
    seriesFolder,
  };
}
