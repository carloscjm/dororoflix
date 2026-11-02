import { describe, expect, it } from 'vitest';
import { buildLibrary } from '../src/library/library-builder.js';
import { overridesFromObject } from '../src/library/metadata-overrides.js';
import { parseSubtitleSuffix } from '../src/library/subtitle-language.js';
import type { DiscoveredFile } from '../src/library/types.js';
import { createVideoId } from '../src/library/video-id.js';

const files = (...paths: string[]): DiscoveredFile[] =>
  paths.map((relativePath, index) => ({ relativePath, sizeBytes: 100 + index, modifiedAt: new Date(2024, 0, index + 1) }));

const byPath = (library: ReturnType<typeof buildLibrary>, relativePath: string) => {
  const video = library.videos.find((item) => item.relativePath === relativePath);
  if (!video) throw new Error(`não encontrado: ${relativePath}`);
  return video;
};

describe('agrupamento de séries', () => {
  const library = buildLibrary(
    'local',
    files(
      'Series/Minha Serie/Temporada 2/S02E01.mkv',
      'Series/Minha Serie/Temporada 1/S01E10.mkv',
      'Series/Minha Serie/Temporada 1/S01E02.mkv',
      'Series/Minha Serie/Temporada 1/S01E01.mkv',
      'Minha.Serie.S03E01.mkv',
      'Outra Serie/Season 1/Outra.Serie.1x01.mp4',
      'Filme.2020.mp4',
    ),
  );

  it('agrupa episódios da mesma série, inclusive de pastas diferentes', () => {
    expect(library.series.map((series) => series.title)).toEqual(['Minha Serie', 'Outra Serie']);
    const minha = library.series[0];
    expect(minha?.seasons.map((season) => season.number)).toEqual([1, 2, 3]);
  });

  it('ordena episódios numericamente (E2 antes de E10)', () => {
    const season1 = library.series[0]?.seasons[0];
    expect(season1?.episodes.map((episode) => (episode.media.kind === 'episode' ? episode.media.episode : -1))).toEqual([
      1, 2, 10,
    ]);
  });

  it('mantém filmes como vídeos individuais e preserva todos no catálogo', () => {
    expect(library.videos).toHaveLength(7);
    expect(byPath(library, 'Filme.2020.mp4').media).toEqual({ kind: 'movie' });
  });

  it('gera IDs de série estáveis e iguais nos episódios', () => {
    const again = buildLibrary('local', files('Series/Minha Serie/Temporada 1/S01E01.mkv'));
    expect(again.series[0]?.id).toBe(library.series[0]?.id);
    const episode = byPath(library, 'Minha.Serie.S03E01.mkv');
    expect(episode.media).toMatchObject({ kind: 'episode', seriesId: library.series[0]?.id });
    expect(episode.id).toBe(createVideoId('local', 'Minha.Serie.S03E01.mkv'));
  });
});

describe('associação de legendas', () => {
  const library = buildLibrary(
    'local',
    files(
      'Filme.mkv',
      'Filme.pt-BR.srt',
      'Filme.en.srt',
      'Filme.pt-BR.forced.srt',
      'Filme 2.mkv',
      'Filme 2.srt',
      'Series/Show/Temporada 1/S01E01.mkv',
      'Series/Show/Temporada 1/S01E01.pt-BR.vtt',
      'Series/Show/Temporada 1/S01E02.mkv',
      'Series/Show/Temporada 1/S01E02.eng.srt',
      'Series/Show/Temporada 1/sem-dono.srt',
      'Expresso/O.Expresso.mkv',
      'Expresso/Legenda/O.Expresso.srt',
      'Unico/filme-x.mkv',
      'Unico/Portuguese.srt',
      'orfa/legenda.srt',
    ),
  );

  it('associa por nome e identifica o idioma pelo sufixo', () => {
    const tracks = byPath(library, 'Filme.mkv').subtitles;
    expect(tracks.map((track) => [track.language, track.label, track.forced])).toEqual([
      ['en', 'Inglês', false],
      ['pt-BR', 'Português (Brasil)', false],
      ['pt-BR', 'Português (Brasil) (forçada)', true],
    ]);
    expect(tracks.every((track) => /^[a-f0-9]{16}$/.test(track.id))).toBe(true);
  });

  it('usa o nome mais longo: "Filme 2.srt" pertence a "Filme 2.mkv", não a "Filme.mkv"', () => {
    expect(byPath(library, 'Filme 2.mkv').subtitles.map((track) => track.relativePath)).toEqual(['Filme 2.srt']);
    expect(byPath(library, 'Filme.mkv').subtitles.some((track) => track.relativePath === 'Filme 2.srt')).toBe(false);
  });

  it('associa legendas de episódios e de subpastas "Legenda"', () => {
    expect(byPath(library, 'Series/Show/Temporada 1/S01E01.mkv').subtitles).toMatchObject([
      { language: 'pt-BR', format: 'vtt' },
    ]);
    expect(byPath(library, 'Series/Show/Temporada 1/S01E02.mkv').subtitles).toMatchObject([{ language: 'en' }]);
    expect(byPath(library, 'Expresso/O.Expresso.mkv').subtitles).toMatchObject([
      { language: null, label: 'Legenda', relativePath: 'Expresso/Legenda/O.Expresso.srt' },
    ]);
  });

  it('em pasta com um único vídeo, associa legendas com outro nome; em pasta com vários, não adivinha', () => {
    expect(byPath(library, 'Unico/filme-x.mkv').subtitles).toMatchObject([{ language: 'pt', label: 'Português' }]);
    const allPaths = library.videos.flatMap((video) => video.subtitles.map((track) => track.relativePath));
    expect(allPaths).not.toContain('Series/Show/Temporada 1/sem-dono.srt');
    expect(allPaths).not.toContain('orfa/legenda.srt');
  });
});

describe('parseSubtitleSuffix', () => {
  it.each([
    ['.pt-BR', 'pt-BR'],
    ['.pt_br', 'pt-BR'],
    ['.PTBR', 'pt-BR'],
    ['.por', 'pt'],
    ['.en', 'en'],
    ['.English.SDH', 'en'],
    ['.spa', 'es'],
    ['.xyz', null],
    ['', null],
  ])('%j → %s', (suffix, language) => {
    expect(parseSubtitleSuffix(suffix).language).toBe(language);
  });

  it('detecta legendas forçadas e SDH', () => {
    expect(parseSubtitleSuffix('.pt-BR.forced')).toMatchObject({ language: 'pt-BR', forced: true, sdh: false });
    expect(parseSubtitleSuffix('.en.sdh')).toMatchObject({ language: 'en', sdh: true });
  });
});

describe('capas existentes', () => {
  const library = buildLibrary(
    'local',
    files(
      'Filme A.mkv',
      'Filme A.jpg',
      'poster.jpg',
      'Filme B.mkv',
      'Pasta Unica/x.mkv',
      'Pasta Unica/folder.png',
      'Series/Show/poster.jpg',
      'Series/Show/Temporada 1/S01E01.mkv',
    ),
  );

  it('usa a imagem com o mesmo nome do vídeo', () => {
    expect(byPath(library, 'Filme A.mkv').artwork).toEqual({ relativePath: 'Filme A.jpg', format: 'jpg' });
  });

  it('só usa poster/folder da pasta quando ela tem um único vídeo', () => {
    expect(byPath(library, 'Filme B.mkv').artwork).toBeNull();
    expect(byPath(library, 'Pasta Unica/x.mkv').artwork).toEqual({ relativePath: 'Pasta Unica/folder.png', format: 'png' });
  });

  it('usa o pôster da pasta da série', () => {
    expect(library.series[0]?.artwork).toEqual({ relativePath: 'Series/Show/poster.jpg', format: 'jpg' });
  });
});

describe('correções manuais de metadados', () => {
  it('permite forçar episódio, filme e título por caminho ou ID', () => {
    const extraId = createVideoId('local', 'Show/extra.mkv');
    const overrides = overridesFromObject({
      videos: {
        [extraId]: { kind: 'episode', seriesTitle: 'Show', season: 1, episode: 99, episodeTitle: 'Bastidores' },
        'Falso.S01E01.mkv': { kind: 'movie', title: 'Na Verdade é um Filme' },
      },
    });
    const library = buildLibrary('local', files('Show/extra.mkv', 'Falso.S01E01.mkv'), overrides);

    expect(byPath(library, 'Show/extra.mkv').media).toMatchObject({ kind: 'episode', season: 1, episode: 99 });
    expect(byPath(library, 'Falso.S01E01.mkv')).toMatchObject({ media: { kind: 'movie' }, title: 'Na Verdade é um Filme' });
  });

  it('rejeita arquivo de correções inválido', () => {
    expect(() => overridesFromObject({ videos: { x: { kind: 'episode' } } })).toThrow();
  });
});
