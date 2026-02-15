import type {
  ServerResponse,
  CreateServerRequest,
  UpdateServerRequest,
  TemplateResponse,
  BackupResponse,
  CreateBackupRequest,
  RestoreBackupResponse,
  ApiErrorResponse,
  RuntimeConfigResponse,
  WebAppResponse,
  CreateWebAppRequest,
  UpdateWebAppRequest,
  AvailableContainer
} from '@garcon/shared';

const API_BASE = '/api';

class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json() as ApiErrorResponse;
    throw new ApiError(
      error.statusCode,
      error.error,
      error.message,
      error.details
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  return handleResponse<T>(response);
}

async function post<T, B = unknown>(path: string, body?: B): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    ...(body !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  return handleResponse<T>(response);
}

async function del<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
  });
  return handleResponse<T>(response);
}

async function patch<T, B = unknown>(path: string, body: B): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

async function put<T, B = unknown>(path: string, body: B): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
}

export const api = {
  servers: {
    list: () => get<ServerResponse[]>('/servers'),
    get: (id: string) => get<ServerResponse>(`/servers/${id}`),
    create: (data: CreateServerRequest) => post<ServerResponse>('/servers', data),
    edit: (id: string, data: UpdateServerRequest) => patch<ServerResponse>(`/servers/${id}`, data),
    delete: (id: string) => del<void>(`/servers/${id}`),
    start: (id: string) => post<ServerResponse>(`/servers/${id}/start`),
    stop: (id: string) => post<ServerResponse>(`/servers/${id}/stop`),
    restart: (id: string) => post<ServerResponse>(`/servers/${id}/restart`),
    acknowledgeCrash: (id: string) => post<ServerResponse>(`/servers/${id}/acknowledge-crash`),
    reorder: (ids: string[]) => put<void>('/servers/order', { ids }),
    update: {
      initiate: (id: string) => post<{ sourcePath: string; backupTimestamp: string; backupPath: string }>(`/servers/${id}/update/initiate`),
      apply: (id: string) => post<ServerResponse>(`/servers/${id}/update/apply`),
      cancel: (id: string) => post<ServerResponse>(`/servers/${id}/update/cancel`),
    },
  },
  templates: {
    list: () => get<TemplateResponse[]>('/templates'),
    get: (id: string) => get<TemplateResponse>(`/templates/${id}`),
  },
  backups: {
    list: (serverId: string) => get<BackupResponse[]>(`/servers/${serverId}/backups`),
    create: (serverId: string, data?: CreateBackupRequest) =>
      post<BackupResponse>(`/servers/${serverId}/backups`, data),
    delete: (serverId: string, timestamp: string) =>
      del<void>(`/servers/${serverId}/backups/${encodeURIComponent(timestamp)}`),
    restore: (serverId: string, timestamp: string) =>
      post<RestoreBackupResponse>(`/servers/${serverId}/backups/${encodeURIComponent(timestamp)}/restore`),
  },
  health: {
    check: () => get<{ status: string; timestamp: string; version: string }>('/health'),
  },
  config: {
    getRuntime: () => get<RuntimeConfigResponse>('/config'),
    listImportFolders: () => get<{ folders: string[] }>('/import/folders'),
  },
  webApps: {
    list: () => get<WebAppResponse[]>('/web-apps'),
    listContainers: () => get<AvailableContainer[]>('/web-apps/containers'),
    create: (data: CreateWebAppRequest) => post<WebAppResponse>('/web-apps', data),
    edit: (id: string, data: UpdateWebAppRequest) => patch<WebAppResponse>(`/web-apps/${id}`, data),
    delete: (id: string) => del<void>(`/web-apps/${id}`),
    reorder: (ids: string[]) => put<void>('/web-apps/order', { ids }),
  },
};

export { ApiError };
