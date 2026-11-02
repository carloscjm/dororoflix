import type { FastifyInstance } from 'fastify';
import { AppError, errorBody } from '../errors/app-error.js';

interface HttpLikeError {
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
}

/** Converte qualquer erro em resposta JSON padronizada e registra no log. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      const level = error.statusCode >= 500 ? 'error' : 'warn';
      request.log[level]({ code: error.code, cause: error.cause }, error.message);
      return reply.code(error.statusCode).send(errorBody(error.code, error.message));
    }

    const httpError = error as HttpLikeError;
    const statusCode = typeof httpError.statusCode === 'number' ? httpError.statusCode : 500;

    // Erros 4xx do próprio Fastify (validação, JSON inválido, etc.).
    if (statusCode >= 400 && statusCode < 500) {
      const code = typeof httpError.code === 'string' ? httpError.code : 'BAD_REQUEST';
      const message = typeof httpError.message === 'string' ? httpError.message : 'Requisição inválida.';
      request.log.warn({ code }, message);
      return reply.code(statusCode).send(errorBody(code, message));
    }

    // Erros inesperados: detalhes só no log, nunca na resposta.
    request.log.error({ err: error }, 'Erro interno não tratado');
    return reply.code(500).send(errorBody('INTERNAL_ERROR', 'Erro interno do servidor.'));
  });

  app.setNotFoundHandler((request, reply) => {
    return reply
      .code(404)
      .send(errorBody('ROUTE_NOT_FOUND', `Rota ${request.method} ${request.url} não encontrada.`));
  });
}
