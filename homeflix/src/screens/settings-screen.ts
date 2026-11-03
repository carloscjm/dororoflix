import { ApiError, normalizeServerUrl, validateServerAddress } from '../api/media-api';
import type { AppContext } from '../app-context';
import { brand, button, icon } from '../components/ui';
import { showDialog } from '../navigation/overlays';
import type { Screen } from '../navigation/router';
import { digitOf, type RemoteKey } from '../platform/keys';
import { deviceDescription } from '../platform/tizen';
import { SUBTITLE_CHOICES, WATCHED_THRESHOLDS } from '../storage/settings-repository';
import { clear, h } from '../utils/dom';

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', ':', '⌫', 'Limpar'] as const;

export interface SettingsScreenOptions {
  /** Primeira execução: depois de conectar, abre a tela inicial. */
  readonly onConnected?: () => void;
}

/** Configurações: endereço do servidor (teclado na tela), conexão, biblioteca, legendas e histórico. */
export class SettingsScreen implements Screen {
  readonly name = 'settings';
  readonly root: HTMLElement;
  private draft: string;
  private readonly addressField = h('div', { class: 'address-field__value' });
  private readonly status = h('div', { class: 'settings__status', role: 'status' });
  private readonly subtitleGroup = h('div', { class: 'choice-group', 'data-focus-group': 'subtitle-pref', 'data-orientation': 'horizontal' });
  private readonly thresholdGroup = h('div', { class: 'choice-group', 'data-focus-group': 'threshold', 'data-orientation': 'horizontal' });
  private busy = false;

  constructor(
    private readonly ctx: AppContext,
    private readonly options: SettingsScreenOptions = {},
  ) {
    this.draft = ctx.settings.get().serverUrl;

    const keypad = h(
      'div',
      { class: 'keypad', 'data-focus-group': 'keypad', 'data-orientation': 'grid', 'data-columns': '5' },
      KEYPAD.map((key) =>
        h(
          'div',
          { class: `keypad__key${key.length > 1 ? ' keypad__key--wide' : ''}`, 'data-focusable': true, 'data-key': `key-${key}`, onclick: () => this.typeKey(key) },
          key,
        ),
      ),
    );

    const serverActions = h(
      'div',
      { class: 'settings__actions', 'data-focus-group': 'server-actions', 'data-orientation': 'horizontal' },
      button('Salvar e conectar', { icon: 'check', primary: true, key: 'save', onClick: () => void this.saveAndConnect() }),
      button('Testar conexão', { icon: 'refresh', key: 'test', onClick: () => void this.testConnection() }),
      button('Atualizar biblioteca', { icon: 'refresh', key: 'scan', onClick: () => void this.scanLibrary() }),
    );

    const historyActions = h(
      'div',
      { class: 'settings__actions', 'data-focus-group': 'history', 'data-orientation': 'horizontal' },
      button('Limpar histórico de reprodução', { key: 'clear-history', onClick: () => void this.clearHistory() }),
    );

    const content = h(
      'div',
      { class: 'settings__content' },
      h(
        'section',
        { class: 'settings__section' },
        h('h2', {}, 'Servidor de mídia'),
        h('p', { class: 'settings__help' }, 'Digite o IP do PC e a porta, como 192.168.15.165:8080. Use o teclado abaixo ou os números do controle.'),
        h('div', { class: 'address-field' }, icon('settings', 'icon address-field__icon'), this.addressField),
        keypad,
        serverActions,
        this.status,
      ),
      h(
        'section',
        { class: 'settings__section' },
        h('h2', {}, 'Idioma preferido das legendas'),
        h('p', { class: 'settings__help' }, 'Usado para escolher a legenda automaticamente ao abrir um vídeo.'),
        this.subtitleGroup,
      ),
      h(
        'section',
        { class: 'settings__section' },
        h('h2', {}, 'Considerar assistido a partir de'),
        this.thresholdGroup,
      ),
      h('section', { class: 'settings__section' }, h('h2', {}, 'Histórico'), historyActions),
      h(
        'section',
        { class: 'settings__section settings__about' },
        h('h2', {}, 'Sobre'),
        h('p', {}, `GatoFlix ${__APP_VERSION__} · ${deviceDescription()}`),
      ),
    );

    this.root = h(
      'div',
      { class: 'screen settings' },
      h('header', { class: 'topbar' }, brand(), h('div', { class: 'topbar__title' }, 'Configurações')),
      h('div', { class: 'settings__scroll', 'data-scroll-y': 'nearest', 'data-scroll-pad': '120' }, content),
    );
  }

  mount(): void {
    this.renderAddress();
    this.renderChoices();
    this.ctx.focus.focusFirst(this.draft ? 'server-actions' : 'keypad');
    if (this.draft) void this.testConnection();
  }

  onKey(key: RemoteKey): boolean {
    const digit = digitOf(key);
    if (digit !== null) {
      this.typeKey(String(digit));
      return true;
    }
    return false;
  }

  private typeKey(key: string): void {
    if (key === '⌫') this.draft = this.draft.slice(0, -1);
    else if (key === 'Limpar') this.draft = '';
    else if (this.draft.length < 60) this.draft += key;
    this.renderAddress();
  }

  private renderAddress(): void {
    this.addressField.textContent = this.draft || 'IP:porta';
    this.addressField.classList.toggle('address-field__value--empty', this.draft === '');
  }

  private renderChoices(): void {
    const settings = this.ctx.settings.get();
    const subtitleSnapshot = this.ctx.focus.snapshot();

    clear(this.subtitleGroup);
    for (const choice of SUBTITLE_CHOICES) {
      this.subtitleGroup.appendChild(
        this.choice(choice.label, `sub-${choice.value}`, settings.subtitleLanguage === choice.value, () => {
          this.ctx.settings.update({ subtitleLanguage: choice.value });
          this.renderChoices();
        }),
      );
    }

    clear(this.thresholdGroup);
    for (const threshold of WATCHED_THRESHOLDS) {
      this.thresholdGroup.appendChild(
        this.choice(`${Math.round(threshold * 100)}%`, `th-${threshold}`, settings.watchedThreshold === threshold, () => {
          this.ctx.settings.update({ watchedThreshold: threshold });
          this.ctx.progress.setWatchedThreshold(threshold);
          this.renderChoices();
        }),
      );
    }

    if (subtitleSnapshot && (subtitleSnapshot.groupId === 'subtitle-pref' || subtitleSnapshot.groupId === 'threshold')) {
      this.ctx.focus.restore(subtitleSnapshot);
    }
  }

  private choice(label: string, key: string, selected: boolean, onClick: () => void): HTMLElement {
    return h(
      'div',
      { class: `choice${selected ? ' choice--selected' : ''}`, 'data-focusable': true, 'data-key': key, role: 'radio', 'aria-checked': String(selected), onclick: onClick },
      selected ? icon('check', 'icon icon--small') : null,
      label,
    );
  }

  private setStatus(text: string, tone: 'ok' | 'error' | 'info'): void {
    this.status.textContent = text;
    this.status.className = `settings__status settings__status--${tone}`;
  }

  private async saveAndConnect(): Promise<void> {
    const problem = validateServerAddress(this.draft);
    if (problem) {
      this.setStatus(problem, 'error');
      return;
    }
    this.draft = normalizeServerUrl(this.draft).replace(/^http:\/\//, '');
    this.renderAddress();
    this.ctx.settings.update({ serverUrl: this.draft });
    const ok = await this.testConnection();
    if (!ok) return;
    try {
      await this.ctx.catalog.load(true);
    } catch {
      // o teste já mostrou o status; a tela inicial exibirá o erro detalhado
    }
    if (this.options.onConnected) this.options.onConnected();
    else this.ctx.toast('Servidor salvo.');
  }

  private async testConnection(): Promise<boolean> {
    if (this.busy) return false;
    const saved = this.ctx.settings.get().serverUrl;
    if (this.draft !== saved) {
      this.setStatus('Endereço ainda não salvo. Use "Salvar e conectar".', 'info');
      return false;
    }
    this.busy = true;
    this.setStatus('Testando conexão...', 'info');
    try {
      const health = await this.ctx.api.health();
      const hours = Math.floor(health.uptimeSeconds / 3600);
      this.setStatus(
        `Conectado a ${normalizeServerUrl(saved) || 'servidor local'} · ${health.catalog.total} vídeo(s) na biblioteca · servidor ativo há ${hours > 0 ? `${hours}h` : `${Math.floor(health.uptimeSeconds / 60)}min`}`,
        'ok',
      );
      return true;
    } catch (error) {
      this.setStatus(error instanceof ApiError ? `Sem conexão: ${error.message}` : 'Sem conexão com o servidor.', 'error');
      return false;
    } finally {
      this.busy = false;
    }
  }

  private async scanLibrary(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.setStatus('Atualizando biblioteca no servidor...', 'info');
    try {
      const result = await this.ctx.api.scanLibrary();
      await this.ctx.catalog.load(true);
      const series = this.ctx.catalog.loaded?.series.length ?? 0;
      this.setStatus(`Biblioteca atualizada: ${result.total} vídeo(s), ${series} série(s) em ${(result.durationMs / 1000).toFixed(1)}s.`, 'ok');
    } catch (error) {
      this.setStatus(error instanceof ApiError ? `Falha ao atualizar: ${error.message}` : 'Falha ao atualizar a biblioteca.', 'error');
    } finally {
      this.busy = false;
    }
  }

  private async clearHistory(): Promise<void> {
    const choice = await showDialog(this.ctx.overlays, {
      title: 'Limpar histórico?',
      message: 'Todas as posições salvas e marcações de "assistido" serão apagadas desta TV.',
      actions: [
        { value: 'cancel', label: 'Cancelar', primary: true },
        { value: 'clear', label: 'Limpar' },
      ],
    });
    if (choice === 'clear') {
      this.ctx.progress.clearAll();
      this.ctx.toast('Histórico apagado.');
    }
  }
}
