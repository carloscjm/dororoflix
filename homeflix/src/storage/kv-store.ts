/**
 * Armazenamento chave-valor síncrono.
 *
 * Na TV usamos o localStorage do app Tizen: ele é gravado no armazenamento
 * interno do aplicativo e sobrevive a fechar o app e desligar a TV (é apagado
 * só ao desinstalar). Cada gravação é feita na hora, então não dependemos de
 * eventos de encerramento.
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(prefix: string): string[];
}

export class LocalStorageStore implements KeyValueStore {
  constructor(private readonly storage: Storage) {}

  get(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    this.storage.setItem(key, value); // erros (cota cheia) sobem para quem chamou
  }

  remove(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch {
      // ignorado: remover é melhor esforço
    }
  }

  keys(prefix: string): string[] {
    const result: string[] = [];
    try {
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index);
        if (key !== null && key.startsWith(prefix)) result.push(key);
      }
    } catch {
      // armazenamento indisponível
    }
    return result;
  }
}

/** Usado nos testes e como último recurso quando o localStorage está bloqueado. */
export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();

  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.data.set(key, value);
  }

  remove(key: string): void {
    this.data.delete(key);
  }

  keys(prefix: string): string[] {
    return [...this.data.keys()].filter((key) => key.startsWith(prefix));
  }
}

export function createDefaultStore(): KeyValueStore {
  try {
    const probe = '__homeflix_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return new LocalStorageStore(window.localStorage);
  } catch {
    return new MemoryStore();
  }
}
