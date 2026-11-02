import { describe, expect, it } from 'vitest';
import { classifyVideoPath, cleanTitle, parseSeasonFolder } from '../src/library/media-classifier.js';

describe('classifyVideoPath — episódios', () => {
  it.each([
    ['Series/Minha Serie/Temporada 1/S01E01.mkv', 'Minha Serie', 1, 1],
    ['Series/Minha Serie/Temporada 1/S01E02.mkv', 'Minha Serie', 1, 2],
    ['Breaking.Bad.S02E05.720p.BluRay.x264.mkv', 'Breaking Bad', 2, 5],
    ['Downloads/The.Office.US.s3e10.mp4', 'The Office US', 3, 10],
    ['Lost/Lost.1x04.Walkabout.avi', 'Lost', 1, 4],
    ['Dark/Season 02/Dark - E03 - Ghosts.mkv', 'Dark', 2, 3],
    ['Friends/Temporada 3/Episódio 12.mp4', 'Friends', 3, 12],
    ['Chaves/1ª Temporada/05 - O Ladrão.mkv', 'Chaves', 1, 5],
    ['Chaves/Season.1/Ep.07.mkv', 'Chaves', 1, 7],
    ['Minha Série - Temporada 2/S02E04.mkv', 'Minha Série', 2, 4],
    ['Better.Call.Saul.S01.1080p.WEB/E06.mkv', 'Better Call Saul', 1, 6],
    ['Series/Minha Serie/S01E09.mkv', 'Minha Serie', 1, 9],
  ])('%s → %s T%iE%i', (relativePath, seriesTitle, season, episode) => {
    expect(classifyVideoPath(relativePath)).toMatchObject({ kind: 'episode', seriesTitle, season, episode });
  });

  it('prefere a pasta da série ao prefixo do arquivo e guarda a pasta para a capa', () => {
    expect(classifyVideoPath('Series/Minha Serie/Temporada 2/Outro.Nome.S02E01.mkv')).toEqual({
      kind: 'episode',
      seriesTitle: 'Minha Serie',
      season: 2,
      episode: 1,
      episodeTitle: null,
      seriesFolder: 'Series/Minha Serie',
    });
  });

  it('extrai o título do episódio sem o ruído do release', () => {
    expect(classifyVideoPath('Breaking.Bad.S01E01.Pilot.720p.WEB-DL.mkv')).toMatchObject({
      episodeTitle: 'Pilot',
    });
    expect(classifyVideoPath('Show.S01E01E02.Parte.Dupla.mkv')).toMatchObject({ episode: 1, episodeTitle: 'Parte Dupla' });
  });
});

describe('classifyVideoPath — não classifica sem evidência suficiente', () => {
  it.each([
    'Home.Alone.1990.720p.BluRay.x264.DualAudio-APOCALIPSE.mkv',
    'Expresso.Polar.2004.1080p.BluRay.X264-Lozano/O.Expresso.Polar.2004.1080p.BluRay.X264-Lozano.mkv',
    'O Natal Magico do Mickey.Nevou na Casa do Mickey.2001.AMZN.WEBRip.1080p.DDP5.1.H264-Dual - By Tontom/O Natal Magico do Mickey.Nevou na Casa do Mickey.2001.AMZN.WEBRip.1080p.DDP5.1.H264-SiGMA-Dual.Tontom.mkv',
    'Filmes/1917.mkv',
    'Se7en.1995.mkv',
    'Video.1920x1080.mp4',
    'Minha Serie/Episodio 3.mkv', // número de episódio sem pasta de temporada
    'Temporada 1/S01E01.mkv', // sem nome de série
    'Séries/Temporada 1/Episodio_01.mkv', // pasta genérica não é nome de série
    'S01E01.mkv',
    'Series/S01E01.mkv',
  ])('%s → filme', (relativePath) => {
    expect(classifyVideoPath(relativePath)).toEqual({ kind: 'movie' });
  });
});

describe('parseSeasonFolder / cleanTitle', () => {
  it('reconhece variações de pasta de temporada', () => {
    expect(parseSeasonFolder('Temporada 1')).toEqual({ season: 1, seriesPrefix: null });
    expect(parseSeasonFolder('Season 01')).toEqual({ season: 1, seriesPrefix: null });
    expect(parseSeasonFolder('S03')).toEqual({ season: 3, seriesPrefix: null });
    expect(parseSeasonFolder('2ª Temporada')).toEqual({ season: 2, seriesPrefix: null });
    expect(parseSeasonFolder('Dark.S02.1080p')).toEqual({ season: 2, seriesPrefix: 'Dark' });
    expect(parseSeasonFolder('Extras')).toBeNull();
    expect(parseSeasonFolder('Toy Story 2')).toBeNull();
  });

  it('limpa nomes de release', () => {
    expect(cleanTitle('The.Boys.2019.1080p')).toBe('The Boys');
    expect(cleanTitle('[Grupo] Naruto - ')).toBe('Naruto');
    expect(cleanTitle('1883')).toBe('1883');
  });
});
