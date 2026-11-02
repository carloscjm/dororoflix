import type { FastifyBaseLogger } from 'fastify';
import { buildLibrary } from './library-builder.js';
import { NO_OVERRIDES, type MetadataOverrides } from './metadata-overrides.js';
import type { MediaSource, ScanResult, SeriesItem, VideoItem } from './types.js';

/** Fornece as correções manuais de metadados a cada scan (relidas do disco). */
export type OverridesProvider = () => Promise<MetadataOverrides>;

/**
 * Catálogo em memória, reconstruído a cada scan.
 *
 * Futuras extensões (metadados externos, histórico no servidor) devem viver em
 * serviços próprios que referenciam `VideoItem.id`/`SeriesItem.id`, sem alterar este scanner.
 */
export class CatalogService {
  private byId = new Map<string, VideoItem>();
  private ordered: readonly VideoItem[] = [];
  private seriesById = new Map<string, SeriesItem>();
  private seriesOrdered: readonly SeriesItem[] = [];
  private lastScan: ScanResult | null = null;
  private scanInFlight: Promise<ScanResult> | null = null;
  private readonly sources: ReadonlyMap<string, MediaSource>;

  constructor(
    sources: readonly MediaSource[],
    private readonly logger: FastifyBaseLogger,
    private readonly loadOverrides: OverridesProvider = async () => NO_OVERRIDES,
  ) {
    this.sources = new Map(sources.map((source) => [source.id, source]));
  }

  /** Executa um scan completo. Chamadas concorrentes compartilham o mesmo scan. */
  scan(): Promise<ScanResult> {
    this.scanInFlight ??= this.runScan().finally(() => {
      this.scanInFlight = null;
    });
    return this.scanInFlight;
  }

  list(): readonly VideoItem[] {
    return this.ordered;
  }

  get(id: string): VideoItem | undefined {
    return this.byId.get(id);
  }

  listSeries(): readonly SeriesItem[] {
    return this.seriesOrdered;
  }

  getSeries(id: string): SeriesItem | undefined {
    return this.seriesById.get(id);
  }

  getLastScan(): ScanResult | null {
    return this.lastScan;
  }

  getSource(sourceId: string): MediaSource {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`Origem de mídia desconhecida: ${sourceId}`);
    return source;
  }

  private async runScan(): Promise<ScanResult> {
    const startedAt = performance.now();
    const next = new Map<string, VideoItem>();
    const nextSeries = new Map<string, SeriesItem>();
    const overrides = await this.loadOverrides();

    for (const source of this.sources.values()) {
      const library = buildLibrary(source.id, await source.scan(), overrides);

      for (const item of library.videos) {
        const existing = next.get(item.id);
        if (existing) {
          this.logger.warn(
            { id: item.id, first: existing.relativePath, second: item.relativePath },
            'ID duplicado no catálogo; mantendo o primeiro arquivo',
          );
          continue;
        }
        next.set(item.id, item);
      }

      for (const series of library.series) {
        // Hoje há uma única origem; com várias, a primeira série com o mesmo ID prevalece.
        if (!nextSeries.has(series.id)) nextSeries.set(series.id, series);
      }
    }

    this.byId = next;
    this.ordered = [...next.values()].sort(compareByTitle);
    this.seriesById = nextSeries;
    this.seriesOrdered = [...nextSeries.values()].sort((a, b) => titleCollator.compare(a.title, b.title));

    const result: ScanResult = {
      total: next.size,
      durationMs: Math.round(performance.now() - startedAt),
      scannedAt: new Date(),
    };
    this.lastScan = result;
    this.logger.info(
      { total: result.total, series: nextSeries.size, durationMs: result.durationMs },
      'Catálogo atualizado',
    );
    return result;
  }
}

const titleCollator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function compareByTitle(a: VideoItem, b: VideoItem): number {
  return titleCollator.compare(a.title, b.title) || titleCollator.compare(a.relativePath, b.relativePath);
}
