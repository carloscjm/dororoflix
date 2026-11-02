/**
 * Erro de domínio com status HTTP e código estável, consumível pelo cliente (ex.: app Tizen).
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

export const videoNotFound = (id: string): AppError =>
  new AppError(404, 'VIDEO_NOT_FOUND', `Vídeo "${id}" não encontrado no catálogo.`);

export const fileMissing = (cause?: unknown): AppError =>
  new AppError(
    404,
    'FILE_MISSING',
    'O arquivo do vídeo não está mais disponível no disco. Execute um novo scan da biblioteca.',
    { cause },
  );

export const forbiddenPath = (): AppError =>
  new AppError(403, 'FORBIDDEN_PATH', 'Acesso negado: caminho fora da pasta de mídia configurada.');

export const seriesNotFound = (id: string): AppError =>
  new AppError(404, 'SERIES_NOT_FOUND', `Série "${id}" não encontrada no catálogo.`);

export const subtitleNotFound = (id: string): AppError =>
  new AppError(404, 'SUBTITLE_NOT_FOUND', `Legenda "${id}" não encontrada para este vídeo.`);

export const artworkNotFound = (): AppError =>
  new AppError(404, 'ARTWORK_NOT_FOUND', 'Este item não tem imagem de capa na biblioteca.');

export const subtitleInvalid = (): AppError =>
  new AppError(422, 'SUBTITLE_INVALID', 'O arquivo de legenda não contém falas válidas em SRT ou WebVTT.');

export const fileTooLarge = (maxBytes: number): AppError =>
  new AppError(413, 'FILE_TOO_LARGE', `O arquivo excede o limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`);

export const forbiddenNetwork = (): AppError =>
  new AppError(403, 'FORBIDDEN_NETWORK', 'Acesso permitido apenas a partir da rede local.');

/** Formato padrão de corpo de erro da API. */
export interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export const errorBody = (code: string, message: string): ErrorBody => ({ error: { code, message } });

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
