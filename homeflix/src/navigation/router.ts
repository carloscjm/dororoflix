import { isDirection, type RemoteKey } from '../platform/keys';
import type { FocusManager, FocusSnapshot } from './focus-manager';

/** Uma tela do app. A raiz é criada pela própria tela e fica no DOM enquanto estiver na pilha. */
export interface Screen {
  readonly name: string;
  readonly root: HTMLElement;
  /** Chamado uma vez, depois que `root` foi anexado ao documento. */
  mount(): void | Promise<void>;
  /** Trata teclas antes da navegação padrão. Retorna true se consumiu. */
  onKey?(key: RemoteKey): boolean;
  /**
   * A tela voltou a ficar visível (ex.: saiu do player): atualizar progresso etc.
   * Retornar true indica que a própria tela já posicionou o foco.
   */
  onShow?(): boolean | void;
  onHide?(): void;
  destroy?(): void;
}

interface Entry {
  readonly screen: Screen;
  snapshot: FocusSnapshot | null;
}

/**
 * Pilha de telas. Telas anteriores ficam ocultas (não destruídas), então voltar
 * é instantâneo e o foco volta exatamente ao item que estava selecionado.
 */
export class Router {
  private readonly stack: Entry[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly focus: FocusManager,
    /** Voltar na primeira tela: o app decide (diálogo "Sair do HomeFlix?"). */
    private readonly onBackAtRoot: () => void,
  ) {}

  get current(): Screen | null {
    return this.stack.at(-1)?.screen ?? null;
  }

  get depth(): number {
    return this.stack.length;
  }

  async push(screen: Screen): Promise<void> {
    const previous = this.stack.at(-1);
    if (previous) {
      previous.snapshot = this.focus.snapshot();
      previous.screen.root.hidden = true;
      previous.screen.onHide?.();
    }
    this.stack.push({ screen, snapshot: null });
    await this.attach(screen);
  }

  /** Substitui a tela atual (ex.: trocar de episódio sem empilhar players). */
  async replace(screen: Screen): Promise<void> {
    const top = this.stack.pop();
    if (top) this.dispose(top.screen);
    this.stack.push({ screen, snapshot: null });
    await this.attach(screen);
  }

  /** Limpa a pilha e começa de uma nova tela raiz. */
  async reset(screen: Screen): Promise<void> {
    while (this.stack.length > 0) {
      const entry = this.stack.pop();
      if (entry) this.dispose(entry.screen);
    }
    this.stack.push({ screen, snapshot: null });
    await this.attach(screen);
  }

  back(): boolean {
    if (this.stack.length <= 1) return false;
    const top = this.stack.pop();
    if (top) this.dispose(top.screen);
    const previous = this.stack.at(-1);
    if (!previous) return false;
    previous.screen.root.hidden = false;
    this.focus.setRoot(previous.screen.root);
    const focused = previous.screen.onShow?.() === true;
    if (!focused && !this.focus.restore(previous.snapshot)) this.focus.focusFirst();
    return true;
  }

  /** Teclas que nenhuma camada (diálogo/menu) consumiu. */
  handleKey(key: RemoteKey): void {
    const screen = this.current;
    if (!screen) return;
    if (screen.onKey?.(key)) return;

    if (isDirection(key)) {
      this.focus.move(key);
    } else if (key === 'enter') {
      this.focus.current()?.click();
    } else if (key === 'back') {
      if (!this.back()) this.onBackAtRoot();
    }
  }

  private async attach(screen: Screen): Promise<void> {
    screen.root.hidden = false;
    this.container.appendChild(screen.root);
    this.focus.setRoot(screen.root);
    await screen.mount();
    if (this.current === screen && !this.focus.current()) this.focus.focusFirst();
  }

  private dispose(screen: Screen): void {
    screen.onHide?.();
    screen.destroy?.();
    screen.root.remove();
  }
}
