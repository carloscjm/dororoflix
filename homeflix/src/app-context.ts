import type { MediaApi } from './api/media-api';
import { episodesBySeries, type Library } from './models/library';
import type { Channel, ChannelGroupList, Episode, SeriesSummary, Video } from './models/media';
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
  private groups: Promise<ChannelGroupList> | null = null;
  private readonly channelCache = new Map<string, Promise<Channel[]>>();

  constructor(private readonly api: MediaApi) {}

  get loaded(): Library | null {
    return this.library;
  }

  load(force = false): Promise<Library> {
    if (this.library && !force) return Promise.resolve(this.library);
    if (!this.pending || force) {
      // Os canais ao vivo NÃO são carregados aqui: a lista pode ser enorme e só é
      // buscada quando o usuário abre a aba "Canais ao vivo".
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

  /** Categorias da TV ao vivo (em cache; `force` recarrega). */
  channelGroups(force = false): Promise<ChannelGroupList> {
    if (!this.groups || force) {
      this.groups = this.api.listChannelGroups();
      this.channelCache.clear();
      this.groups.catch(() => {
        this.groups = null; // erro não fica em cache
      });
    }
    return this.groups;
  }

  /** Canais de uma categoria (em cache). */
  channelsOf(group: string): Promise<Channel[]> {
    let pending = this.channelCache.get(group);
    if (!pending) {
      pending = this.api.listChannels(group).then((list) => [...list.items]);
      pending.catch(() => this.channelCache.delete(group));
      this.channelCache.set(group, pending);
    }
    return pending;
  }

  series(id: string): SeriesSummary | null {
    return this.library?.series.find((item) => item.id === id) ?? null;
  }
}
