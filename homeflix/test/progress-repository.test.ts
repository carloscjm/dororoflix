import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/storage/kv-store';
import { PROGRESS_PREFIX, ProgressRepository } from '../src/storage/progress-repository';
import { SettingsRepository } from '../src/storage/settings-repository';
import { META, progressRepo } from './fixtures';

describe('ProgressRepository — persistência do histórico', () => {
  it('grava id, posição, duração e data da última reprodução', () => {
    const { repo } = progressRepo(1000);
    const record = repo.save({ videoId: 'v1', positionSec: 1295.44, durationSec: 6000, meta: META });
    expect(record).toMatchObject({ videoId: 'v1', positionSec: 1295.4, durationSec: 6000, updatedAt: 1000, watched: false });
    expect(repo.get('v1')).toEqual(record);
  });

  it('sobrevive a "reiniciar o app" (nova instância sobre o mesmo armazenamento)', () => {
    const store = new MemoryStore();
    new ProgressRepository(store).save({ videoId: 'v1', positionSec: 300, durationSec: 1000, meta: META });
    const afterRestart = new ProgressRepository(store);
    expect(afterRestart.get('v1')?.positionSec).toBe(300);
    expect(afterRestart.resumePosition('v1')).toBe(300);
  });

  it('usa uma chave por vídeo (gravações pequenas e independentes)', () => {
    const { repo, store } = progressRepo();
    repo.save({ videoId: 'a', positionSec: 20, durationSec: 100, meta: META });
    repo.save({ videoId: 'b', positionSec: 20, durationSec: 100, meta: META });
    expect(store.keys(PROGRESS_PREFIX).sort()).toEqual([`${PROGRESS_PREFIX}a`, `${PROGRESS_PREFIX}b`]);
  });

  it('marca como assistido ao passar de 90% e mantém a marca ao rever', () => {
    const { repo, tick } = progressRepo();
    expect(repo.save({ videoId: 'v', positionSec: 899, durationSec: 1000, meta: META }).watched).toBe(false);
    tick();
    const done = repo.save({ videoId: 'v', positionSec: 900, durationSec: 1000, meta: META });
    expect(done.watched).toBe(true);
    expect(done.watchedAt).not.toBeNull();
    tick();
    const rewatch = repo.save({ videoId: 'v', positionSec: 60, durationSec: 1000, meta: META });
    expect(rewatch.watched).toBe(true);
    expect(rewatch.watchedAt).toBe(done.watchedAt);
    expect(repo.isInProgress(rewatch)).toBe(true); // revendo: volta a aparecer em "continuar"
  });

  it('permite ajustar o limite de "assistido"', () => {
    const { repo } = progressRepo();
    repo.setWatchedThreshold(0.95);
    expect(repo.save({ videoId: 'v', positionSec: 920, durationSec: 1000, meta: META }).watched).toBe(false);
    expect(repo.isInProgress(repo.get('v'))).toBe(true);
  });

  it('decide quando oferecer "continuar"', () => {
    const { repo } = progressRepo();
    expect(repo.isInProgress(repo.save({ videoId: 'a', positionSec: 5, durationSec: 1000, meta: META }))).toBe(false);
    expect(repo.isInProgress(repo.save({ videoId: 'b', positionSec: 500, durationSec: 1000, meta: META }))).toBe(true);
    expect(repo.isInProgress(repo.save({ videoId: 'c', positionSec: 950, durationSec: 1000, meta: META }))).toBe(false);
    expect(repo.isInProgress(repo.save({ videoId: 'd', positionSec: 500, durationSec: null, meta: META }))).toBe(true);
    expect(repo.resumePosition('c')).toBe(0);
    expect(repo.resumePosition('inexistente')).toBe(0);
  });

  it('mantém a duração conhecida quando o player ainda não a informou', () => {
    const { repo } = progressRepo();
    repo.save({ videoId: 'v', positionSec: 100, durationSec: 1000, meta: META });
    expect(repo.save({ videoId: 'v', positionSec: 200, durationSec: null, meta: META }).durationSec).toBe(1000);
  });

  it('normaliza posições inválidas e além da duração', () => {
    const { repo } = progressRepo();
    expect(repo.save({ videoId: 'a', positionSec: Number.NaN, durationSec: 100, meta: META }).positionSec).toBe(0);
    expect(repo.save({ videoId: 'b', positionSec: 150, durationSec: 100, meta: META }).positionSec).toBe(100);
  });

  it('ignora registros corrompidos sem quebrar a listagem', () => {
    const { repo, store } = progressRepo();
    repo.save({ videoId: 'ok', positionSec: 30, durationSec: 100, meta: META });
    store.set(`${PROGRESS_PREFIX}ruim`, '{nao é json');
    store.set(`${PROGRESS_PREFIX}incompleto`, JSON.stringify({ videoId: 'x' }));
    expect(repo.list().map((record) => record.videoId)).toEqual(['ok']);
    expect(repo.get('ruim')).toBeNull();
  });

  it('marca e desmarca manualmente como assistido', () => {
    const { repo } = progressRepo();
    expect(repo.markWatched('v', META, 1200)).toMatchObject({ watched: true, positionSec: 1200 });
    repo.markUnwatched('v');
    expect(repo.get('v')).toBeNull();
  });

  it('incrementa a revisão a cada gravação (base para sincronização futura)', () => {
    const { repo } = progressRepo();
    repo.save({ videoId: 'v', positionSec: 10, durationSec: 100, meta: META });
    expect(repo.save({ videoId: 'v', positionSec: 20, durationSec: 100, meta: META }).revision).toBe(2);
  });

  it('libera espaço apagando os registros mais antigos quando a cota estoura', () => {
    let now = 0;
    const store = new MemoryStore();
    const repo = new ProgressRepository(store, () => ++now);
    for (let index = 0; index < 10; index++) repo.save({ videoId: `old${index}`, positionSec: 20, durationSec: 100, meta: META });
    const realSet = store.set.bind(store);
    let failures = 1;
    store.set = (key, value) => {
      if (failures-- > 0) throw new Error('QuotaExceededError');
      realSet(key, value);
    };
    repo.save({ videoId: 'novo', positionSec: 20, durationSec: 100, meta: META });
    expect(repo.get('novo')).not.toBeNull();
  });
});

describe('SettingsRepository', () => {
  it('usa padrões, salva alterações e ignora valores inválidos', () => {
    const store = new MemoryStore();
    const settings = new SettingsRepository(store);
    expect(settings.get()).toEqual({ serverUrl: '', subtitleLanguage: 'pt-BR', watchedThreshold: 0.9 });
    expect(settings.hasServer()).toBe(false);
    settings.update({ serverUrl: '192.168.15.165:8080', subtitleLanguage: 'en' });
    expect(new SettingsRepository(store).get()).toMatchObject({ serverUrl: '192.168.15.165:8080', subtitleLanguage: 'en' });
    store.set('homeflix.settings.v1', JSON.stringify({ watchedThreshold: 7 }));
    expect(settings.get().watchedThreshold).toBe(0.9);
    store.set('homeflix.settings.v1', 'lixo');
    expect(settings.get().serverUrl).toBe('');
  });
});
