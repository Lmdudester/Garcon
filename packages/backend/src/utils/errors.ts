export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      'NOT_FOUND',
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      404
    );
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}

export class DockerError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('DOCKER_ERROR', message, 500, details);
    this.name = 'DockerError';
  }
}

export class FileSystemError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('FILESYSTEM_ERROR', message, 500, details);
    this.name = 'FileSystemError';
  }
}

export class ServerStateError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('SERVER_STATE_ERROR', message, 400, details);
    this.name = 'ServerStateError';
  }
}

export class NativeProcessError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('NATIVE_PROCESS_ERROR', message, 500, details);
    this.name = 'NativeProcessError';
  }
}
