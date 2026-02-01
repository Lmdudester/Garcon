import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { createChildLogger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

const logger = createChildLogger('error-handler');

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error({ err: error, url: request.url }, 'Request error');

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      statusCode: error.statusCode,
      details: error.details
    });
  }

  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      statusCode: 400,
      details: {
        issues: error.issues
      }
    });
  }

  if (error.validation) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: error.message,
      statusCode: 400
    });
  }

  const statusCode = error.statusCode || 500;
  return reply.status(statusCode).send({
    error: 'INTERNAL_ERROR',
    message: statusCode === 500 ? 'Internal server error' : error.message,
    statusCode
  });
}
