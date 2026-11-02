import { describe, expect, it, vi } from 'vitest';
import { SubtitleRenderer, renderCueText } from '../src/subtitles/subtitle-renderer';
import { chooseSubtitle, preferenceFor, SubtitleService } from '../src/subtitles/subtitle-service';
import { activeCues, parseVtt, SubtitleParseError } from '../src/subtitles/vtt-parser';
import { h } from '../src/utils/dom';
import { subtitle } from './fixtures';

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Primeira fala

00:00:03.500 --> 00:00:05.000
<i>Sobreposta</i>

00:01:00.000 --> 00:01:02.500
Um minuto
`;

describe('parseVtt / activeCues — sincronização', () => {
  const cues = parseVtt(VTT);

  it('lê os tempos corretamente', () => {
    expect(cues.map((cue) => [cue.start, cue.end])).toEqual([
      [1, 4],
      [3.5, 5],
      [60, 62.5],
    ]);
  });

  it('encontra a fala ativa em qualquer instante, inclusive após avançar e retroceder', () => {
    expect(activeCues(cues, 0.5)).toEqual([]);
    expect(activeCues(cues, 2).map((cue) => cue.text)).toEqual(['Primeira fala']);
    expect(activeCues(cues, 3.7).map((cue) => cue.text)).toEqual(['Primeira fala', '<i>Sobreposta</i>']);
    expect(activeCues(cues, 61).map((cue) => cue.text)).toEqual(['Um minuto']); // avançou
    expect(activeCues(cues, 4.5).map((cue) => cue.text)).toEqual(['<i>Sobreposta</i>']); // voltou
    expect(activeCues(cues, 62.5)).toEqual([]); // fim exclusivo
  });

  it('aceita SRT diretamente e rejeita arquivos sem falas', () => {
    expect(parseVtt('1\n00:00:01,000 --> 00:00:02,000\nOi\n')).toHaveLength(1);
    expect(() => parseVtt('isto não é legenda')).toThrow(SubtitleParseError);
    expect(() => parseVtt('')).toThrow(SubtitleParseError);
  });
});

describe('renderização segura', () => {
  it('mantém <i>/<b>/<u> e quebras de linha, descarta outras tags', () => {
    const container = h('div');
    container.appendChild(renderCueText('<i>Olá</i>\n<font color="red">mundo</font> <script>alert(1)</script>&amp;'));
    expect(container.innerHTML).toBe('<i>Olá</i><br>mundo alert(1)&amp;');
    expect(container.querySelector('script')).toBeNull();
  });

  it('o renderizador só altera o DOM quando a fala muda', () => {
    const layer = h('div');
    const renderer = new SubtitleRenderer(layer);
    renderer.setCues(parseVtt(VTT));
    renderer.update(2);
    const first = layer.firstChild;
    expect(layer.textContent).toBe('Primeira fala');
    renderer.update(2.5);
    expect(layer.firstChild).toBe(first);
    renderer.update(10);
    expect(layer.textContent).toBe('');
    renderer.setCues(null);
    renderer.update(2);
    expect(layer.textContent).toBe('');
  });
});

describe('escolha de legenda', () => {
  const ptBr = subtitle('pt-BR');
  const ptForced = subtitle('pt-BR', { forced: true });
  const en = subtitle('en');
  const unknown = subtitle(null);

  it('segue a preferência salva: idioma exato, depois idioma base', () => {
    expect(chooseSubtitle([en, ptForced, ptBr], 'pt-BR')).toBe(ptBr); // não forçada primeiro
    expect(chooseSubtitle([en, subtitle('pt')], 'pt-BR')?.language).toBe('pt');
    expect(chooseSubtitle([ptBr, en], 'en')).toBe(en);
    expect(chooseSubtitle([ptBr, en], 'off')).toBeNull();
    expect(chooseSubtitle([en], 'es')).toBeNull();
  });

  it('usa a única legenda sem idioma identificado', () => {
    expect(chooseSubtitle([unknown], 'pt-BR')).toBe(unknown);
    expect(chooseSubtitle([unknown, en], 'pt-BR')).toBeNull();
  });

  it('calcula a preferência a salvar', () => {
    expect(preferenceFor(null, 'pt-BR')).toBe('off');
    expect(preferenceFor(en, 'pt-BR')).toBe('en');
    expect(preferenceFor(unknown, 'pt-BR')).toBe('pt-BR');
  });

  it('SubtitleService: cacheia sucesso e não cacheia falhas (arquivo inválido)', async () => {
    const load = vi.fn<(url: string) => Promise<string>>().mockResolvedValueOnce('lixo').mockResolvedValue(VTT);
    const service = new SubtitleService(load);
    await expect(service.cues(ptBr)).rejects.toBeInstanceOf(SubtitleParseError);
    await expect(service.cues(ptBr)).resolves.toHaveLength(3);
    await service.cues(ptBr);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
