import { describe, expect, it, vi } from 'vitest';
import { AvplayEngine, errorFromEvent } from '../src/player/avplay-engine';
import { PlaybackService, type Scheduler } from '../src/player/playback-service';
import {
  NOOP_LISTENER,
  PlayerError,
  type EngineListener,
  type EngineState,
  type VideoEngine,
} from '../src/player/video-engine';
import { META, progressRepo } from './fixtures';

/** Motor falso controlado pelo teste (o AVPlay real só existe na TV). */
class FakeEngine implements VideoEngine {
  readonly kind = 'html5' as const;
  listener: EngineListener = NOOP_LISTENER;
  position = 0;
  total: number | null = 1000;
  current: EngineState = 'idle';
  loads: [string, number][] = [];
  failLoad: PlayerError | null = null;
  destroyed = false;
  suspended = false;

  setListener(listener: EngineListener): void {
    this.listener = listener;
  }
  async load(url: string, startAt: number): Promise<void> {
    this.loads.push([url, startAt]);
    if (this.failLoad) {
      this.setState('error');
      this.listener.onError(this.failLoad);
      throw this.failLoad;
    }
    this.position = startAt;
    this.setState('playing');
  }
  play(): void {
    this.setState('playing');
  }
  pause(): void {
    this.setState('paused');
  }
  seek(position: number): void {
    this.position = position;
  }
  currentTime(): number {
    return this.position;
  }
  duration(): number | null {
    return this.total;
  }
  state(): EngineState {
    return this.current;
  }
  suspend(): void {
    this.suspended = true;
  }
  restore(): void {
    this.suspended = false;
  }
  destroy(): void {
    this.destroyed = true;
  }
  /** Simula o avanço da reprodução. */
  advance(seconds: number): void {
    this.position += seconds;
    this.listener.onTimeUpdate(this.position);
  }
  setState(state: EngineState): void {
    this.current = state;
    this.listener.onStateChange(state);
  }
}

class FakeScheduler implements Scheduler {
  private handlers = new Map<number, () => void>();
  private nextId = 1;
  setInterval(handler: () => void): number {
    const id = this.nextId++;
    this.handlers.set(id, handler);
    return id;
  }
  clearInterval(id: number): void {
    this.handlers.delete(id);
  }
  fire(): void {
    for (const handler of this.handlers.values()) handler();
  }
  get active(): number {
    return this.handlers.size;
  }
}

function setup() {
  const engine = new FakeEngine();
  const scheduler = new FakeScheduler();
  const { repo, tick } = progressRepo();
  const events = { onEnded: vi.fn(), onError: vi.fn(), onSaved: vi.fn() };
  const service = new PlaybackService(engine, repo, events, scheduler, 10_000);
  const item = { videoId: 'v1', url: 'http://pc:8080/api/videos/v1/stream', meta: META };
  return { engine, scheduler, repo, tick, events, service, item };
}

describe('PlaybackService — salvamento do progresso', () => {
  it('salva periodicamente enquanto toca (TV pode ser desligada sem aviso)', async () => {
    const { engine, scheduler, repo, service, item } = setup();
    await service.start(item, 0);
    engine.advance(10);
    scheduler.fire();
    expect(repo.get('v1')?.positionSec).toBe(10);
    engine.advance(25);
    scheduler.fire();
    expect(repo.get('v1')?.positionSec).toBe(35);
  });

  it('não salva no intervalo quando está pausado', async () => {
    const { engine, scheduler, repo, service, item, events } = setup();
    await service.start(item, 0);
    engine.advance(20);
    service.pause(); // pausar salva
    expect(repo.get('v1')?.positionSec).toBe(20);
    const saves = events.onSaved.mock.calls.length;
    scheduler.fire();
    expect(events.onSaved.mock.calls.length).toBe(saves);
  });

  it('salva ao sair do player e ao ir para segundo plano', async () => {
    const { engine, repo, service, item, scheduler } = setup();
    await service.start(item, 0);
    engine.advance(42);
    service.suspend();
    expect(engine.suspended).toBe(true);
    expect(repo.get('v1')?.positionSec).toBe(42);
    engine.advance(8);
    service.stop();
    expect(repo.get('v1')?.positionSec).toBe(50);
    expect(engine.destroyed).toBe(true);
    expect(scheduler.active).toBe(0);
  });

  it('retoma a partir da posição salva', async () => {
    const { engine, service, item } = setup();
    await service.start(item, 1295);
    expect(engine.loads).toEqual([[item.url, 1295]]);
    expect(service.position()).toBe(1295);
  });

  it('busca (avançar/retroceder) respeita os limites e salva', async () => {
    const { repo, service, item } = setup();
    await service.start(item, 100);
    expect(service.seekBy(30)).toBe(130);
    expect(repo.get('v1')?.positionSec).toBe(130);
    expect(service.seekBy(-500)).toBe(0);
    expect(service.seekTo(5000)).toBe(999);
  });

  it('ao terminar marca como assistido e avisa (para oferecer o próximo episódio)', async () => {
    const { engine, repo, service, item, events, scheduler } = setup();
    await service.start(item, 0);
    engine.advance(990);
    engine.setState('ended');
    expect(repo.get('v1')).toMatchObject({ watched: true, positionSec: 1000 });
    expect(events.onEnded).toHaveBeenCalledTimes(1);
    expect(scheduler.active).toBe(0);
  });

  it('erro ao abrir não apaga o histórico existente', async () => {
    const { engine, repo, service, item, events } = setup();
    repo.save({ videoId: 'v1', positionSec: 600, durationSec: 1000, meta: META });
    engine.failLoad = new PlayerError('network', 'Falha de rede');
    await expect(service.start(item, 600)).rejects.toBeInstanceOf(PlayerError);
    expect(events.onError).toHaveBeenCalledWith(engine.failLoad);
    service.stop();
    expect(repo.get('v1')?.positionSec).toBe(600);
  });

  it('erro durante a reprodução salva a última posição conhecida', async () => {
    const { engine, repo, service, item, events } = setup();
    await service.start(item, 0);
    engine.advance(300);
    engine.position = 0; // alguns players zeram a posição ao falhar
    engine.listener.onError(new PlayerError('network', 'Conexão perdida'));
    expect(events.onError).toHaveBeenCalled();
    expect(repo.get('v1')?.positionSec).toBe(300);
  });

  it('trocar de episódio salva o anterior', async () => {
    const { engine, repo, service, item } = setup();
    await service.start(item, 0);
    engine.advance(77);
    await service.start({ ...item, videoId: 'v2' }, 0);
    expect(repo.get('v1')?.positionSec).toBe(77);
  });
});

/** Mock do webapis.avplay com o ciclo de estados documentado pela Samsung. */
function fakeAvplay(options: { prepareFails?: boolean; seekFails?: boolean } = {}) {
  let state: AVPlayState = 'NONE';
  let listener: AVPlayListener = {};
  let time = 0;
  const calls: string[] = [];
  const avplay: AVPlayManager = {
    open: (url) => {
      calls.push(`open ${url}`);
      state = 'IDLE';
    },
    close: () => {
      calls.push('close');
      state = 'NONE';
    },
    prepareAsync: (ok, fail) => {
      calls.push('prepare');
      if (options.prepareFails) fail?.({ name: 'PLAYER_ERROR_NOT_SUPPORTED_FORMAT' });
      else {
        state = 'READY';
        ok?.();
      }
    },
    setDisplayRect: () => calls.push('rect'),
    setDisplayMethod: () => undefined,
    setListener: (value) => {
      listener = value;
    },
    play: () => {
      calls.push('play');
      state = 'PLAYING';
    },
    pause: () => {
      calls.push('pause');
      state = 'PAUSED';
    },
    stop: () => {
      calls.push('stop');
      state = 'IDLE';
    },
    seekTo: (ms, ok, fail) => {
      calls.push(`seek ${ms}`);
      if (options.seekFails) fail?.(new Error('seek'));
      else {
        time = ms;
        ok?.();
      }
    },
    getCurrentTime: () => time,
    getDuration: () => 7_200_000,
    getState: () => state,
    suspend: () => calls.push('suspend'),
    restore: () => calls.push('restore'),
  };
  return { avplay, calls, emit: () => listener, setTime: (ms: number) => void (time = ms) };
}

describe('AvplayEngine (mock do AVPlay — validação real só na TV)', () => {
  it('abre, prepara, posiciona na retomada e toca', async () => {
    const { avplay, calls } = fakeAvplay();
    const engine = new AvplayEngine(avplay);
    const states: EngineState[] = [];
    engine.setListener({ ...NOOP_LISTENER, onStateChange: (state) => states.push(state) });
    await engine.load('http://pc:8080/x', 1295);
    expect(calls).toEqual(['open http://pc:8080/x', 'rect', 'prepare', 'seek 1295000', 'play']);
    expect(engine.duration()).toBe(7200);
    expect(engine.currentTime()).toBe(1295);
    expect(states).toEqual(['loading', 'playing']);
  });

  it('se o seek inicial falhar, toca do começo em vez de travar', async () => {
    const { avplay, calls } = fakeAvplay({ seekFails: true });
    await new AvplayEngine(avplay).load('u', 500);
    expect(calls.at(-1)).toBe('play');
  });

  it('erro no prepare vira PlayerError "unsupported"', async () => {
    const { avplay } = fakeAvplay({ prepareFails: true });
    const engine = new AvplayEngine(avplay);
    const onError = vi.fn();
    engine.setListener({ ...NOOP_LISTENER, onError });
    await expect(engine.load('u', 0)).rejects.toMatchObject({ kind: 'unsupported' });
    expect(onError).toHaveBeenCalled();
    expect(engine.state()).toBe('error');
  });

  it('traduz eventos do AVPlay: buffering, tempo, fim e erros de rede', async () => {
    const { avplay, emit } = fakeAvplay();
    const engine = new AvplayEngine(avplay);
    const states: EngineState[] = [];
    const times: number[] = [];
    const errors: PlayerError[] = [];
    engine.setListener({
      onStateChange: (state) => states.push(state),
      onTimeUpdate: (time) => times.push(time),
      onDurationChange: () => undefined,
      onError: (error) => errors.push(error),
    });
    await engine.load('u', 0);
    emit().onbufferingstart?.();
    emit().oncurrentplaytime?.(4000);
    emit().onstreamcompleted?.();
    emit().onerror?.('PLAYER_ERROR_CONNECTION_FAILED');
    expect(states).toEqual(['loading', 'playing', 'buffering', 'playing', 'ended', 'error']);
    expect(times).toContain(4);
    expect(errors[0]?.kind).toBe('network');
  });

  it('suspende e restaura ao ir para segundo plano', async () => {
    const { avplay, calls } = fakeAvplay();
    const engine = new AvplayEngine(avplay);
    await engine.load('u', 0);
    engine.suspend();
    engine.restore();
    expect(calls).toContain('suspend');
    expect(calls).toContain('restore');
    engine.destroy();
    expect(calls.slice(-2)).toEqual(['stop', 'close']);
  });

  it('classifica códigos de erro', () => {
    expect(errorFromEvent('PLAYER_ERROR_NOT_SUPPORTED_FILE').kind).toBe('unsupported');
    expect(errorFromEvent('PLAYER_ERROR_TIMEOUT').kind).toBe('network');
    expect(errorFromEvent('ALGO_NOVO').kind).toBe('decode');
  });
});
