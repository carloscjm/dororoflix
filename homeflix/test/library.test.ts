import { describe, expect, it } from 'vitest';
import { buildHomeSections, episodesBySeries, nextEpisode, previousEpisode, resolveContinuation } from '../src/models/library';
import type { Episode } from '../src/models/media';
import { episode, movie, progressRepo, seriesSummary } from './fixtures';

const SERIES = 'aaaaaaaaaaaaaaaa';
const meta = (item: Episode) => ({
  title: item.media.seriesTitle,
  seriesId: item.media.seriesId,
  season: item.media.season,
  episode: item.media.episode,
});

function seriesLibrary() {
  // Fora de ordem de propósito: a ordenação é responsabilidade do app.
  const eps = [
    episode(SERIES, 'Minha Série', 2, 1),
    episode(SERIES, 'Minha Série', 1, 10),
    episode(SERIES, 'Minha Série', 1, 2),
    episode(SERIES, 'Minha Série', 1, 1),
    episode(SERIES, 'Minha Série', 2, 4),
  ];
  return eps;
}

describe('episodesBySeries — agrupamento e ordenação', () => {
  it('agrupa por série e ordena por temporada e episódio (numérico)', () => {
    const grouped = episodesBySeries([...seriesLibrary(), movie('Filme')]);
    const list = grouped.get(SERIES) ?? [];
    expect(list.map((item) => `${item.media.season}x${item.media.episode}`)).toEqual(['1x1', '1x2', '1x10', '2x1', '2x4']);
    expect(grouped.size).toBe(1);
  });

  it('próximo e anterior seguem a ordem, atravessando temporadas', () => {
    const list = episodesBySeries(seriesLibrary()).get(SERIES) ?? [];
    expect(nextEpisode(list, list[2]?.id ?? '')?.media).toMatchObject({ season: 2, episode: 1 });
    expect(nextEpisode(list, list[4]?.id ?? '')).toBeNull();
    expect(previousEpisode(list, list[0]?.id ?? '')).toBeNull();
    expect(previousEpisode(list, list[3]?.id ?? '')?.media).toMatchObject({ season: 1, episode: 10 });
  });
});

describe('resolveContinuation — continuar série', () => {
  it('sem histórico: começa pelo primeiro episódio', () => {
    const { repo } = progressRepo();
    const list = episodesBySeries(seriesLibrary()).get(SERIES) ?? [];
    expect(resolveContinuation(list, repo)).toMatchObject({ type: 'start', episode: { id: list[0]?.id } });
  });

  it('retoma o último episódio parcialmente assistido na posição salva (ex.: T2:E4 aos 21min35s)', () => {
    const { repo, tick } = progressRepo();
    const list = episodesBySeries(seriesLibrary()).get(SERIES) ?? [];
    const t1e1 = list[0] as Episode;
    const t2e4 = list[4] as Episode;
    repo.save({ videoId: t1e1.id, positionSec: 1500, durationSec: 1500, meta: meta(t1e1) });
    tick();
    repo.save({ videoId: t2e4.id, positionSec: 1295, durationSec: 2700, meta: meta(t2e4) });
    expect(resolveContinuation(list, repo)).toEqual({ type: 'resume', episode: t2e4, positionSec: 1295 });
  });

  it('último episódio terminado: indica o próximo ainda não assistido', () => {
    const { repo } = progressRepo();
    const list = episodesBySeries(seriesLibrary()).get(SERIES) ?? [];
    const second = list[1] as Episode;
    repo.markWatched(second.id, meta(second), 1500);
    expect(resolveContinuation(list, repo)).toMatchObject({ type: 'next', episode: { id: list[2]?.id } });
  });

  it('pula episódios já vistos e, se tudo foi visto, sugere rever', () => {
    const { repo, tick } = progressRepo();
    const list = episodesBySeries(seriesLibrary()).get(SERIES) ?? [];
    for (const item of list) {
      repo.markWatched(item.id, meta(item), 100);
      tick();
    }
    expect(resolveContinuation(list, repo)).toMatchObject({ type: 'rewatch', episode: { id: list[0]?.id } });

    repo.markUnwatched(list[3]?.id ?? '');
    expect(resolveContinuation(list, repo)).toMatchObject({ type: 'next', episode: { id: list[3]?.id } });
  });

  it('o progresso é por episódio, não por série', () => {
    const { repo } = progressRepo();
    const list = episodesBySeries(seriesLibrary()).get(SERIES) ?? [];
    const target = list[2] as Episode;
    repo.save({ videoId: target.id, positionSec: 300, durationSec: 1000, meta: meta(target) });
    expect(repo.get(list[1]?.id ?? '')).toBeNull();
    expect(repo.get(target.id)?.episode).toBe(10);
  });
});

describe('buildHomeSections — integração com o catálogo', () => {
  it('monta Continuar assistindo, Filmes, Séries e Adicionados recentemente', () => {
    const { repo, tick } = progressRepo();
    const filmeA = movie('Zebra', { modifiedAt: '2024-01-01T00:00:00.000Z' });
    const filmeB = movie('Avatar', { modifiedAt: '2024-03-01T00:00:00.000Z', artworkUrl: '/api/videos/b/artwork' });
    const eps = seriesLibrary();
    const series = seriesSummary(SERIES, 'Minha Série', { seasonCount: 2, episodeCount: 5, latestModifiedAt: '2024-02-01T00:00:00.000Z' });

    repo.save({ videoId: filmeA.id, positionSec: 600, durationSec: 6000, meta: { title: filmeA.title, seriesId: null, season: null, episode: null } });
    tick();
    const ordered = episodesBySeries(eps).get(SERIES) ?? [];
    const t1e2 = ordered[1] as Episode;
    repo.save({ videoId: t1e2.id, positionSec: 100, durationSec: 1000, meta: meta(t1e2) });

    const sections = buildHomeSections({ videos: [filmeA, filmeB, ...eps], series: [series] }, repo);
    expect(sections.map((section) => section.id)).toEqual(['continue', 'movies', 'series', 'recent']);

    const [continueRow, movies, seriesRow, recent] = sections;
    expect(continueRow?.items.map((item) => item.title)).toEqual(['Minha Série', 'Zebra']); // mais recente primeiro
    expect(continueRow?.items[0]).toMatchObject({ subtitle: 'T1:E2', progress: 0.1, target: { type: 'resume', videoId: t1e2.id } });
    expect(movies?.items.map((item) => item.title)).toEqual(['Avatar', 'Zebra']);
    expect(movies?.items[1]?.progress).toBeCloseTo(0.1);
    expect(seriesRow?.items[0]).toMatchObject({ subtitle: 'Série · 2 temporadas', target: { type: 'series', seriesId: SERIES } });
    expect(recent?.items.map((item) => item.title)).toEqual(['Avatar', 'Minha Série', 'Zebra']);
  });

  it('mostra o próximo episódio quando o último foi concluído e ignora vídeos removidos', () => {
    const { repo } = progressRepo();
    const eps = seriesLibrary();
    const ordered = episodesBySeries(eps).get(SERIES) ?? [];
    const first = ordered[0] as Episode;
    repo.markWatched(first.id, meta(first), 1000);
    repo.save({ videoId: 'removido', positionSec: 500, durationSec: 1000, meta: { title: 'X', seriesId: null, season: null, episode: null } });

    const sections = buildHomeSections({ videos: eps, series: [seriesSummary(SERIES, 'Minha Série')] }, repo);
    const continueRow = sections.find((section) => section.id === 'continue');
    expect(continueRow?.items).toHaveLength(1);
    expect(continueRow?.items[0]).toMatchObject({ subtitle: 'Próximo: T1:E2', progress: 0 });
  });

  it('omite seções vazias e marca filmes assistidos', () => {
    const { repo } = progressRepo();
    const filme = movie('Único');
    repo.markWatched(filme.id, { title: filme.title, seriesId: null, season: null, episode: null }, 100);
    const sections = buildHomeSections({ videos: [filme], series: [] }, repo);
    expect(sections.map((section) => section.id)).toEqual(['movies', 'recent']);
    expect(sections[0]?.items[0]).toMatchObject({ badge: 'Assistido', progress: null });
  });
});
