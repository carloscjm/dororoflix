import type { MediaApi } from './api/media-api';
import { episodesBySeries, type Library } from './models/library';
import type { Episode, SeriesSummary, Video } from './models/media';
import type { FocusManager } from './navigation/focus-manager';
import type { OverlayManager } from './navigation/overlays';
import type { Router } from './navigation/router';
import type { VideoEngine } from './player/video-engine';
import type { ProgressRepository } from './storage/progress-repository';
import type { SettingsRepository } from './storage/settings-repository';

/** Dependências compartilhadas pelas telas (injeção manual, sem framework). */
export interface AppContext {
  readonly api: MediaApi;
  readonly catalog: CatalogStore;
  readonly progress: ProgressRepository;
  readonly settings: SettingsRepository;
  readonly focus: FocusManager;
  readonly router: Router;
  readonly overlays: OverlayManager;
  /** Host para diálogos e avisos (fica acima das telas). */
  readonly overlayHost: HTMLElement;
  readonly createEngine: (videoHost: HTMLElement) => VideoEngine;
  toast(message: string): void;
}

/** Cache do catálogo em memória; recarregado sob demanda (ex.: após scan). */
export class CatalogStore {
  private library: Library | null = null;
  private pending: Promise<Library> | null = null;
  private episodes = new Map<string, Episode[]>();
  private videosById = new Map<string, Video>();

  constructor(private readonly api: MediaApi) {}

  get loaded(): Library | null {
    return this.library;
  }

  load(force = false): Promise<Library> {
    if (this.library && !force) return Promise.resolve(this.library);
    if (!this.pending || force) {
      this.pending = Promise.all([this.api.listVideos(), this.api.listSeries()])
        .then(([videos, series]) => {
          const library: Library = { videos: videos.items, series: series.items };
          this.library = library;
          this.episodes = episodesBySeries(library.videos);
          this.videosById = new Map(library.videos.map((video) => [video.id, video]));
          return library;
        })
        .finally(() => {
          this.pending = null;
        });
    }
    return this.pending;
  }

  video(id: string): Video | null {
    return this.videosById.get(id) ?? null;
  }

  episodesOf(seriesId: string): Episode[] {
    return this.episodes.get(seriesId) ?? [];
  }

  series(id: string): SeriesSummary | null {
    return this.library?.series.find((item) => item.id === id) ?? null;
  }
}
