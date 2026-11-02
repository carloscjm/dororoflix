import type { ProgressRecord } from '../storage/progress-repository';
import { isEpisode, type Episode, type SeriesSummary, type Video } from './media';

/**
 * Regras de catálogo puras (sem DOM nem rede): seções da tela inicial,
 * continuação de séries e próximo episódio. Todas testadas em test/library.test.ts.
 */

export interface ProgressView {
  get(videoId: string): ProgressRecord | null;
  list(): ProgressRecord[];
  isInProgress(record: ProgressRecord | null): record is ProgressRecord;
  fraction(record: ProgressRecord | null): number | null;
}

export type CardTarget =
  | { readonly type: 'movie'; readonly videoId: string }
  | { readonly type: 'series'; readonly seriesId: string }
  | { readonly type: 'resume'; readonly videoId: string; readonly seriesId: string | null };

export interface CardItem {
  readonly key: string;
  readonly title: string;
  readonly subtitle: string;
  readonly artworkUrl: string | null;
  readonly progress: number | null;
  readonly badge: string | null;
  readonly target: CardTarget;
  /** Para ordenar "adicionados recentemente" e montar o banner. */
  readonly addedAt: number;
}

export interface HomeSection {
  readonly id: 'continue' | 'movies' | 'series' | 'recent';
  readonly title: string;
  readonly items: readonly CardItem[];
}

export interface Library {
  readonly videos: readonly Video[];
  readonly series: readonly SeriesSummary[];
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** Episódios de cada série, em ordem de temporada e episódio, a partir de /api/videos. */
export function episodesBySeries(videos: readonly Video[]): Map<string, Episode[]> {
  const result = new Map<string, Episode[]>();
  for (const video of videos) {
    if (!isEpisode(video)) continue;
    const list = result.get(video.media.seriesId);
    if (list) list.push(video);
    else result.set(video.media.seriesId, [video]);
  }
  for (const list of result.values()) list.sort(compareEpisodes);
  return result;
}

export function compareEpisodes(a: Episode, b: Episode): number {
  return (
    a.media.season - b.media.season ||
    a.media.episode - b.media.episode ||
    collator.compare(a.relativePath, b.relativePath)
  );
}

export type Continuation =
  | { readonly type: 'resume'; readonly episode: Episode; readonly positionSec: number }
  | { readonly type: 'next'; readonly episode: Episode }
  | { readonly type: 'start'; readonly episode: Episode }
  | { readonly type: 'rewatch'; readonly episode: Episode };

/**
 * O que "Continuar assistindo" deve tocar numa série:
 * - último episódio mexido ainda pela metade → retoma na posição salva;
 * - último episódio mexido já assistido → próximo episódio ainda não assistido;
 * - nada assistido → primeiro episódio; tudo assistido → recomeçar.
 */
export function resolveContinuation(episodes: readonly Episode[], progress: ProgressView): Continuation | null {
  const first = episodes[0];
  if (!first) return null;

  let last: Episode | null = null;
  let lastIndex = -1;
  let lastRecord: ProgressRecord | null = null;
  for (let index = 0; index < episodes.length; index++) {
    const episode = episodes[index] as Episode;
    const record = progress.get(episode.id);
    if (record && (lastRecord === null || record.updatedAt > lastRecord.updatedAt)) {
      last = episode;
      lastRecord = record;
      lastIndex = index;
    }
  }

  if (last === null || lastRecord === null) return { type: 'start', episode: first };
  if (progress.isInProgress(lastRecord)) {
    return { type: 'resume', episode: last, positionSec: lastRecord.positionSec };
  }

  const isWatched = (episode: Episode): boolean => progress.get(episode.id)?.watched === true;
  const after = episodes.slice(lastIndex + 1).find((episode) => !isWatched(episode));
  if (after) return { type: 'next', episode: after };
  const unwatched = episodes.find((episode) => !isWatched(episode));
  if (unwatched) return { type: 'next', episode: unwatched };
  return { type: 'rewatch', episode: first };
}

export function nextEpisode(episodes: readonly Episode[], currentId: string): Episode | null {
  const index = episodes.findIndex((episode) => episode.id === currentId);
  return index === -1 ? null : (episodes[index + 1] ?? null);
}

export function previousEpisode(episodes: readonly Episode[], currentId: string): Episode | null {
  const index = episodes.findIndex((episode) => episode.id === currentId);
  return index <= 0 ? null : (episodes[index - 1] ?? null);
}

function movieCard(video: Video, progress: ProgressView): CardItem {
  const record = progress.get(video.id);
  return {
    key: `movie:${video.id}`,
    title: video.title,
    subtitle: 'Filme',
    artworkUrl: video.artworkUrl,
    progress: progress.isInProgress(record) ? progress.fraction(record) : null,
    badge: record?.watched ? 'Assistido' : null,
    target: { type: 'movie', videoId: video.id },
    addedAt: Date.parse(video.modifiedAt) || 0,
  };
}

function seriesCard(series: SeriesSummary): CardItem {
  const seasons = series.seasonCount === 1 ? '1 temporada' : `${series.seasonCount} temporadas`;
  return {
    key: `series:${series.id}`,
    title: series.title,
    subtitle: `Série · ${seasons}`,
    artworkUrl: series.artworkUrl,
    progress: null,
    badge: null,
    target: { type: 'series', seriesId: series.id },
    addedAt: Date.parse(series.latestModifiedAt) || 0,
  };
}

/** Monta as seções da tela inicial. */
export function buildHomeSections(library: Library, progress: ProgressView, recentLimit = 20): HomeSection[] {
  const videosById = new Map(library.videos.map((video) => [video.id, video]));
  const seriesById = new Map(library.series.map((series) => [series.id, series]));
  const episodes = episodesBySeries(library.videos);

  // Continuar assistindo: um card por filme pela metade e um por série com atividade.
  const records = progress.list().sort((a, b) => b.updatedAt - a.updatedAt);
  const continueItems: CardItem[] = [];
  const seenSeries = new Set<string>();
  for (const record of records) {
    const video = videosById.get(record.videoId);
    if (!video) continue; // vídeo removido da biblioteca: histórico fica guardado, mas some da tela

    if (isEpisode(video)) {
      const seriesId = video.media.seriesId;
      if (seenSeries.has(seriesId)) continue;
      seenSeries.add(seriesId);
      const continuation = resolveContinuation(episodes.get(seriesId) ?? [], progress);
      if (!continuation || continuation.type === 'rewatch' || continuation.type === 'start') continue;
      const episode = continuation.episode;
      const episodeRecord = progress.get(episode.id);
      continueItems.push({
        key: `continue:${seriesId}`,
        title: video.media.seriesTitle,
        subtitle:
          `${continuation.type === 'next' ? 'Próximo: ' : ''}T${episode.media.season}:E${episode.media.episode}` +
          (episode.media.episodeTitle ? ` · ${episode.media.episodeTitle}` : ''),
        artworkUrl: episode.artworkUrl ?? seriesById.get(seriesId)?.artworkUrl ?? null,
        progress: continuation.type === 'resume' ? progress.fraction(episodeRecord) : 0,
        badge: null,
        target: { type: 'resume', videoId: episode.id, seriesId },
        addedAt: record.updatedAt,
      });
    } else if (progress.isInProgress(record)) {
      continueItems.push({
        ...movieCard(video, progress),
        key: `continue:${video.id}`,
        target: { type: 'resume', videoId: video.id, seriesId: null },
        addedAt: record.updatedAt,
      });
    }
  }

  const movies = library.videos
    .filter((video) => !isEpisode(video))
    .map((video) => movieCard(video, progress))
    .sort((a, b) => collator.compare(a.title, b.title));

  const seriesCards = library.series.map(seriesCard).sort((a, b) => collator.compare(a.title, b.title));

  const recent = [...movies, ...seriesCards]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, recentLimit)
    .map((item) => ({ ...item, key: `recent:${item.key}` }));

  const sections: HomeSection[] = [
    { id: 'continue', title: 'Continuar assistindo', items: continueItems },
    { id: 'movies', title: 'Filmes', items: movies },
    { id: 'series', title: 'Séries', items: seriesCards },
    { id: 'recent', title: 'Adicionados recentemente', items: recent },
  ];
  return sections.filter((section) => section.items.length > 0);
}
