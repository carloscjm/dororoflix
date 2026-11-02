import { activeCues, type Cue } from './vtt-parser';

const ALLOWED_TAGS = new Set(['i', 'b', 'u']);

/**
 * Converte o texto de uma fala em nós DOM seguros: só <i>, <b>, <u> e quebras de
 * linha viram formatação; qualquer outra tag (ex.: <font>, <script>) é descartada
 * e todo o resto entra como texto puro.
 */
export function renderCueText(text: string, doc: Document = document): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  const stack: Node[] = [fragment];
  const tokens = text.split(/(<\/?[a-zA-Z][^>]*>)/);

  for (const token of tokens) {
    if (token === '') continue;
    const tag = /^<(\/?)([a-zA-Z]+)[^>]*>$/.exec(token);
    const top = stack[stack.length - 1] as Node;
    if (tag) {
      const name = (tag[2] ?? '').toLowerCase();
      if (!ALLOWED_TAGS.has(name)) continue;
      if (tag[1] === '/') {
        if (stack.length > 1 && (stack[stack.length - 1] as Element).tagName?.toLowerCase() === name) stack.pop();
      } else {
        const element = doc.createElement(name);
        top.appendChild(element);
        stack.push(element);
      }
      continue;
    }
    const lines = token.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) top.appendChild(doc.createElement('br'));
      if (line !== '') top.appendChild(doc.createTextNode(decodeEntities(line)));
    });
  }
  return fragment;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Camada de legendas sobre o vídeo, atualizada a partir da posição do player. */
export class SubtitleRenderer {
  private cues: readonly Cue[] = [];
  private shown: readonly Cue[] = [];

  constructor(private readonly container: HTMLElement) {
    container.setAttribute('aria-live', 'off');
  }

  setCues(cues: readonly Cue[] | null): void {
    this.cues = cues ?? [];
    this.shown = [];
    this.container.textContent = '';
  }

  hasCues(): boolean {
    return this.cues.length > 0;
  }

  /** Chamado periodicamente e após cada busca; só mexe no DOM quando a fala muda. */
  update(timeSec: number): void {
    const active = this.cues.length === 0 ? [] : activeCues(this.cues, timeSec);
    if (active.length === this.shown.length && active.every((cue, index) => cue === this.shown[index])) return;
    this.shown = active;
    this.container.textContent = '';
    for (const cue of active) {
      const line = this.container.ownerDocument.createElement('div');
      line.className = 'subtitle-line';
      line.appendChild(renderCueText(cue.text, this.container.ownerDocument));
      this.container.appendChild(line);
    }
  }
}
