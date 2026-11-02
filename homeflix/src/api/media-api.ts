import type { ChannelGroupList, ChannelList, Health, ScanResult, SeriesDetail, SeriesList, Video, VideoList } from '../models/media';

export type ApiErrorKind = 'not-configured' | 'network' | 'timeout' | 'http' | 'invalid-response';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status: number | null = null,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Normaliza o endereço digitado: "192.168.0.10:8080" → "http://192.168.0.10:8080".
 * Vazio = mesma origem (modo navegador com proxy do Vite).
 */
export function normalizeServerUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, '');
  if (value === '') return '';
  return /^https?:\/\//i.test(value) ? value : `http://${value}`;
}

/** Valida o formato "IP:porta" (ou nome:porta). Retorna uma mensagem de erro ou null. */
export function validateServerAddress(raw: string): string | null {
  const url = normalizeServerUrl(raw);
  if (url === '') return 'Informe o IP e a porta do servidor (ex.: 192.168.15.165:8080).';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Endereço inválido.';
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    return 'Na TV, "localhost" é a própria TV. Use o IP do PC na rede local.';
  }
  if (parsed.port === '' && !/:\d+$/.test(raw.trim())) return 'Informe também a porta (ex.: :8080).';
  return null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface MediaApiOptions {
  readonly baseUrl: () => string;
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
}

/** Cliente da API REST do servidor de mídia. */
export class MediaApi {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: MediaApiOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  /** URL absoluta para recursos da API (stream, legendas, capas). */
  resolve(path: string): string {
    return `${normalizeServerUrl(this.options.baseUrl())}${path}`;
  }

  health(timeoutMs = 4000): Promise<Health> {
    return this.json<Health>('/health', { timeoutMs });
  }

  listVideos(): Promise<VideoList> {
    return this.json<VideoList>('/api/videos');
  }

  getVideo(id: string): Promise<Video> {
    return this.json<Video>(`/api/videos/${encodeURIComponent(id)}`);
  }

  listSeries(): Promise<SeriesList> {
    return this.json<SeriesList>('/api/series');
  }

  getSeries(id: string): Promise<SeriesDetail> {
    return this.json<SeriesDetail>(`/api/series/${encodeURIComponent(id)}`);
  }

  /** Categorias da lista IPTV (leve). Listas grandes podem demorar no primeiro carregamento do servidor. */
  listChannelGroups(): Promise<ChannelGroupList> {
    return this.json<ChannelGroupList>('/api/iptv/groups', { timeoutMs: 120_000 });
  }

  /** Canais de uma categoria. */
  listChannels(group: string): Promise<ChannelList> {
    return this.json<ChannelList>(`/api/iptv/channels?group=${encodeURIComponent(group)}`, { timeoutMs: 120_000 });
  }

  scanLibrary(): Promise<ScanResult> {
    return this.json<ScanResult>('/api/library/scan', { method: 'POST', timeoutMs: 120_000 });
  }

  /** Texto WebVTT de uma legenda (o servidor converte SRT e corrige a codificação). */
  subtitleText(url: string): Promise<string> {
    return this.request(url, {}).then((response) => response.text());
  }

  private async json<T>(path: string, init: { method?: string; timeoutMs?: number } = {}): Promise<T> {
    const response = await this.request(path, init);
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError('invalid-response', 'O servidor respondeu em um formato inesperado.');
    }
  }

  private async request(path: string, init: { method?: string; timeoutMs?: number }): Promise<Response> {
    const url = this.resolve(path);
    const isTv = typeof tizen !== 'undefined';
    if (isTv && !/^https?:\/\//.test(url)) {
      throw new ApiError('not-configured', 'Configure o endereço do servidor.');
    }

    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller?.abort();
    }, init.timeoutMs ?? this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: init.method ?? 'GET',
        ...(controller ? { signal: controller.signal } : {}),
      });
    } catch {
      if (timedOut) throw new ApiError('timeout', 'O servidor demorou demais para responder.');
      throw new ApiError('network', 'Não foi possível conectar ao servidor. Verifique se ele está ligado e o endereço.');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let code: string | null = null;
      let message = `O servidor respondeu com erro ${response.status}.`;
      try {
        const body = (await response.json()) as { error?: { code?: string; message?: string } };
        code = body.error?.code ?? null;
        if (body.error?.message) message = body.error.message;
      } catch {
        // corpo não é JSON
      }
      throw new ApiError('http', message, response.status, code);
    }
    return response;
  }
}
