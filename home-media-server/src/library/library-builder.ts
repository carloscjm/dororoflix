import path from 'node:path';
import { detectFormat, detectImageFormat, detectSubtitleFormat, mimeTypeFor } from './formats.js';
import { classifyVideoPath, normalizeKey } from './media-classifier.js';
import { applyOverride, NO_OVERRIDES, type MetadataOverrides } from './metadata-overrides.js';
import { parseSubtitleSuffix } from './subtitle-language.js';
import { titleFromFileName } from './title.js';
import type { Artwork, DiscoveredFile, SeasonGroup, SeriesItem, SubtitleTrack, VideoItem } from './types.js';
import { createStableId, createVideoId } from './video-id.js';

/** Subpastas comuns onde ficam as legendas de um vídeo (ex.: "Filme/Legenda/Filme.srt"). */
const SUBTITLE_FOLDERS = new Set(['legenda', 'legendas', 'sub', 'subs', 'subtitle', 'subtitles']);

/** Nomes de imagem que representam a pasta inteira, em ordem de preferência. */
const FOLDER_ART_NAMES = ['poster', 'capa', 'cover', 'folder'];

/** Sufixos aceitos para a capa de um vídeo específico: "Filme.jpg", "Filme-poster.jpg". */
const VIDEO_ART_SUFFIXES = ['', '-poster', '.poster', '-capa', '.capa'];

export interface BuiltLibrary {
  readonly videos: readonly VideoItem[];
  readonly series: readonly SeriesItem[];
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function dirOf(relativePath: string): string {
  return path.posix.dirname(relativePath);
}

function baseOf(relativePath: string): string {
  return path.posix.parse(relativePath).name;
}

function lowerKey(value: string): string {
  return value.normalize('NFC').toLowerCase();
}

/**
 * Monta vídeos e séries a partir dos arquivos de uma origem. Função pura:
 * não acessa o disco, o que facilita testar todas as regras de associação.
 */
export function buildLibrary(
  sourceId: string,
  files: readonly DiscoveredFile[],
  overrides: MetadataOverrides = NO_OVERRIDES,
): BuiltLibrary {
  const videoFiles: DiscoveredFile[] = [];
  const subtitleFiles: DiscoveredFile[] = [];
  const imagesByDir = new Map<string, DiscoveredFile[]>();
  const videosByDir = new Map<string, DiscoveredFile[]>();

  for (const file of files) {
    const name = path.posix.basename(file.relativePath);
    if (detectFormat(name) !== null) {
      videoFiles.push(file);
      pushTo(videosByDir, dirOf(file.relativePath), file);
    } else if (detectSubtitleFormat(name) !== null) {
      subtitleFiles.push(file);
    } else if (detectImageFormat(name) !== null) {
      pushTo(imagesByDir, dirOf(file.relativePath), file);
    }
  }

  const subtitlesByVideo = associateSubtitles(sourceId, subtitleFiles, videosByDir);

  /**
   * Capa que representa a pasta inteira: primeiro os nomes conhecidos (poster, capa...);
   * senão, qualquer imagem da pasta (a maior, que costuma ser o pôster e não uma miniatura).
   * Só deve ser usada quando a pasta pertence a um único filme ou a uma série.
   */
  const folderArt = (dir: string | null): Artwork | null => {
    if (dir === null) return null;
    const images = imagesByDir.get(dir === '' ? '.' : dir) ?? [];
    for (const wanted of FOLDER_ART_NAMES) {
      const found = images.find((image) => lowerKey(baseOf(image.relativePath)) === wanted);
      if (found) return toArtwork(found);
    }
    const largest = [...images].sort((a, b) => b.sizeBytes - a.sizeBytes || collator.compare(a.relativePath, b.relativePath))[0];
    return largest ? toArtwork(largest) : null;
  };

  const videoArt = (video: DiscoveredFile): Artwork | null => {
    const dir = dirOf(video.relativePath);
    const base = lowerKey(baseOf(video.relativePath));
    const images = imagesByDir.get(dir) ?? [];
    for (const suffix of VIDEO_ART_SUFFIXES) {
      const found = images.find((image) => lowerKey(baseOf(image.relativePath)) === base + suffix);
      if (found) return toArtwork(found);
    }
    // Imagens da pasta (qualquer nome) só valem para o vídeo quando ele é o único da pasta.
    return (videosByDir.get(dir)?.length ?? 0) === 1 ? folderArt(dir) : null;
  };

  const videos: VideoItem[] = [];
  const seenIds = new Set<string>();
  const seriesDrafts = new Map<string, { title: string; folder: string | null; episodes: VideoItem[] }>();

  const sortedVideos = [...videoFiles].sort((a, b) => collator.compare(a.relativePath, b.relativePath));
  for (const file of sortedVideos) {
    const fileName = path.posix.basename(file.relativePath);
    const format = detectFormat(fileName);
    if (format === null) continue;

    const id = createVideoId(sourceId, file.relativePath);
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const override = overrides.find(id, file.relativePath);
    const classification = applyOverride(classifyVideoPath(file.relativePath), override);

    let video: VideoItem = {
      id,
      sourceId,
      title: override?.title ?? titleFromFileName(fileName),
      format,
      mimeType: mimeTypeFor(format),
      sizeBytes: file.sizeBytes,
      relativePath: file.relativePath,
      modifiedAt: file.modifiedAt,
      media: { kind: 'movie' },
      subtitles: subtitlesByVideo.get(file.relativePath) ?? [],
      artwork: videoArt(file),
    };

    if (classification.kind === 'episode') {
      const seriesId = createStableId('series', normalizeKey(classification.seriesTitle));
      video = {
        ...video,
        media: {
          kind: 'episode',
          seriesId,
          seriesTitle: classification.seriesTitle,
          season: classification.season,
          episode: classification.episode,
          episodeTitle: classification.episodeTitle,
        },
      };

      let draft = seriesDrafts.get(seriesId);
      if (!draft) {
        draft = { title: classification.seriesTitle, folder: classification.seriesFolder, episodes: [] };
        seriesDrafts.set(seriesId, draft);
      }
      draft.folder ??= classification.seriesFolder;
      draft.episodes.push(video);
    }

    videos.push(video);
  }

  const series: SeriesItem[] = [...seriesDrafts.entries()].map(([id, draft]) => ({
    id,
    sourceId,
    title: draft.title,
    artwork: folderArt(draft.folder),
    seasons: groupSeasons(draft.episodes),
  }));
  series.sort((a, b) => collator.compare(a.title, b.title));

  return { videos, series };
}

function groupSeasons(episodes: readonly VideoItem[]): SeasonGroup[] {
  const bySeason = new Map<number, VideoItem[]>();
  for (const episode of episodes) {
    if (episode.media.kind !== 'episode') continue;
    pushTo(bySeason, episode.media.season, episode);
  }
  return [...bySeason.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, list]) => ({ number, episodes: list.sort(compareEpisodes) }));
}

export function compareEpisodes(a: VideoItem, b: VideoItem): number {
  const ae = a.media.kind === 'episode' ? a.media.episode : 0;
  const be = b.media.kind === 'episode' ? b.media.episode : 0;
  return ae - be || collator.compare(a.relativePath, b.relativePath);
}

function associateSubtitles(
  sourceId: string,
  subtitleFiles: readonly DiscoveredFile[],
  videosByDir: ReadonlyMap<string, readonly DiscoveredFile[]>,
): Map<string, SubtitleTrack[]> {
  const result = new Map<string, SubtitleTrack[]>();
  const sdhByTrack = new Map<SubtitleTrack, boolean>();
  const unlabeled = new Map<SubtitleTrack, string | null>();

  for (const subtitle of subtitleFiles) {
    const format = detectSubtitleFormat(subtitle.relativePath);
    if (format === null) continue;

    const subtitleDir = dirOf(subtitle.relativePath);
    const inSubtitleFolder =
      subtitleDir !== '.' && SUBTITLE_FOLDERS.has(normalizeKey(path.posix.basename(subtitleDir)));
    const candidates = videosByDir.get(inSubtitleFolder ? dirOf(subtitleDir) : subtitleDir) ?? [];
    if (candidates.length === 0) continue;

    const subtitleBase = baseOf(subtitle.relativePath);
    const subtitleKey = lowerKey(subtitleBase);

    // Prefere o vídeo cujo nome é o prefixo mais longo do nome da legenda.
    let match: DiscoveredFile | null = null;
    let matchLength = -1;
    for (const video of candidates) {
      const videoKey = lowerKey(baseOf(video.relativePath));
      const next = subtitleKey.charAt(videoKey.length);
      if (subtitleKey.startsWith(videoKey) && (next === '' || /[\s._-]/.test(next)) && videoKey.length > matchLength) {
        match = video;
        matchLength = videoKey.length;
      }
    }

    let suffix: string;
    if (match !== null) {
      suffix = subtitleBase.slice(matchLength);
    } else if (candidates.length === 1 && candidates[0] !== undefined) {
      // Pasta com um único vídeo: a legenda só pode ser dele (ex.: "Portuguese.srt").
      match = candidates[0];
      suffix = subtitleBase;
    } else {
      continue; // ambíguo: não associa
    }

    const info = parseSubtitleSuffix(suffix);
    const track: SubtitleTrack = {
      id: createStableId('subtitle', createVideoId(sourceId, subtitle.relativePath)),
      language: info.language,
      label: info.label ?? '',
      format,
      forced: info.forced,
      relativePath: subtitle.relativePath,
    };
    sdhByTrack.set(track, info.sdh);
    unlabeled.set(track, info.label);
    pushTo(result, match.relativePath, track);
  }

  for (const [videoPath, tracks] of result) {
    const withLabels = tracks.map((track) => {
      let label = unlabeled.get(track) ?? 'Legenda';
      if (track.forced) label += ' (forçada)';
      if (sdhByTrack.get(track)) label += ' (SDH)';
      return { track, label };
    });
    withLabels.sort(
      (a, b) => collator.compare(a.label, b.label) || collator.compare(a.track.relativePath, b.track.relativePath),
    );
    const used = new Map<string, number>();
    const labeled = withLabels.map(({ track, label }) => {
      const count = (used.get(label) ?? 0) + 1;
      used.set(label, count);
      return { ...track, label: count > 1 ? `${label} ${count}` : label };
    });
    result.set(videoPath, labeled);
  }

  return result;
}

function toArtwork(file: DiscoveredFile): Artwork | null {
  const format = detectImageFormat(file.relativePath);
  return format === null ? null : { relativePath: file.relativePath, format };
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
