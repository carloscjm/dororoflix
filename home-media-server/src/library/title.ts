import path from 'node:path';

/**
 * Deriva um título legível do nome do arquivo.
 * Ex.: "O.Auto.da.Compadecida_2000.mp4" → "O Auto da Compadecida 2000".
 * Metadados reais (TMDB etc.) poderão substituir isso no futuro.
 */
export function titleFromFileName(fileName: string): string {
  const base = path.posix.parse(fileName).name;
  const cleaned = base.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : base;
}
