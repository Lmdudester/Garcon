import crypto from 'crypto';
import http from 'http';
import https from 'https';
import path from 'path';
import Docker from 'dockerode';
import * as cheerio from 'cheerio';
import type { WebAppLink, WebAppResponse, CreateWebAppRequest, UpdateWebAppRequest, WebAppMetadata, AvailableContainer, ContainerStatus } from '@garcon/shared';
import { readYaml, writeYaml, pathExists } from './file-manager.service.js';
import { config } from '../config/index.js';
import { createChildLogger } from '../utils/logger.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';

const logger = createChildLogger('web-app');

const WEB_APPS_FILE = 'web-apps.yaml';
const METADATA_FETCH_TIMEOUT = 5000;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

function generateId(containerName: string): string {
  const slug = slugify(containerName);
  const hex = crypto.randomBytes(5).toString('hex');
  return `${slug}-${hex}`;
}

class WebAppService {
  private webApps: WebAppLink[] = [];
  private docker: Docker;
  private filePath: string;

  constructor() {
    this.docker = new Docker({ socketPath: config.docker.socketPath });
    this.filePath = path.join(config.paths.dataDir, WEB_APPS_FILE);
  }

  async initialize(): Promise<void> {
    const exists = await pathExists(this.filePath);
    if (exists) {
      const data = await readYaml<WebAppLink[] | null>(this.filePath);
      this.webApps = data ?? [];
    } else {
      this.webApps = [];
    }
    logger.info({ count: this.webApps.length }, 'Web apps loaded');
  }

  private async save(): Promise<void> {
    await writeYaml(this.filePath, this.webApps);
  }

  async listWebApps(): Promise<WebAppResponse[]> {
    const results = await Promise.all(
      this.webApps.map(async (app) => {
        const [metadata, containerStatus] = await Promise.all([
          this.fetchMetadata(app.url),
          this.getContainerStatus(app.containerName),
        ]);
        return {
          ...app,
          metadata,
          containerStatus,
        };
      })
    );
    return results;
  }

  async createWebApp(data: CreateWebAppRequest): Promise<WebAppResponse> {
    const existing = this.webApps.find(a => a.containerName === data.containerName);
    if (existing) {
      throw new ConflictError(`A web app is already tracking container "${data.containerName}"`);
    }

    const now = new Date().toISOString();
    const webApp: WebAppLink = {
      id: generateId(data.containerName),
      containerName: data.containerName,
      url: data.url,
      name: data.name ?? null,
      description: data.description ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.webApps.push(webApp);
    await this.save();
    logger.info({ id: webApp.id, containerName: webApp.containerName }, 'Web app created');

    const [metadata, containerStatus] = await Promise.all([
      this.fetchMetadata(webApp.url),
      this.getContainerStatus(webApp.containerName),
    ]);

    return { ...webApp, metadata, containerStatus };
  }

  async updateWebApp(id: string, data: UpdateWebAppRequest): Promise<WebAppResponse> {
    const index = this.webApps.findIndex(a => a.id === id);
    if (index === -1) {
      throw new NotFoundError('Web app', id);
    }

    const current = this.webApps[index]!;

    if (data.containerName && data.containerName !== current.containerName) {
      const existing = this.webApps.find(a => a.containerName === data.containerName);
      if (existing) {
        throw new ConflictError(`A web app is already tracking container "${data.containerName}"`);
      }
    }

    const updated: WebAppLink = {
      id: current.id,
      containerName: data.containerName ?? current.containerName,
      url: data.url ?? current.url,
      name: data.name !== undefined ? (data.name ?? null) : (current.name ?? null),
      description: data.description !== undefined ? (data.description ?? null) : (current.description ?? null),
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    this.webApps[index] = updated;
    await this.save();
    logger.info({ id }, 'Web app updated');

    const [metadata, containerStatus] = await Promise.all([
      this.fetchMetadata(updated.url),
      this.getContainerStatus(updated.containerName),
    ]);

    return { ...updated, metadata, containerStatus };
  }

  async deleteWebApp(id: string): Promise<void> {
    const index = this.webApps.findIndex(a => a.id === id);
    if (index === -1) {
      throw new NotFoundError('Web app', id);
    }

    this.webApps.splice(index, 1);
    await this.save();
    logger.info({ id }, 'Web app deleted');
  }

  async reorderWebApps(orderedIds: string[]): Promise<void> {
    const currentIds = new Set(this.webApps.map(a => a.id));
    const requestedIds = new Set(orderedIds);

    if (currentIds.size !== requestedIds.size ||
        ![...currentIds].every(id => requestedIds.has(id))) {
      throw new ValidationError('Ordered IDs must match the current set of web apps');
    }

    const lookup = new Map(this.webApps.map(a => [a.id, a]));
    this.webApps = orderedIds.map(id => lookup.get(id)!);
    await this.save();
    logger.info('Web apps reordered');
  }

  async listAvailableContainers(): Promise<AvailableContainer[]> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      const trackedNames = new Set(this.webApps.map(a => a.containerName));

      return containers
        .filter(c => {
          const labels = c.Labels || {};
          if (labels['garcon.managed'] === 'true') return false;
          const name = c.Names?.[0]?.replace(/^\//, '') ?? '';
          return !trackedNames.has(name);
        })
        .map(c => ({
          name: c.Names?.[0]?.replace(/^\//, '') ?? '',
          status: c.State === 'running' ? 'running' as const : 'stopped' as const,
        }))
        .filter(c => c.name.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      logger.warn({ error }, 'Failed to list Docker containers');
      return [];
    }
  }

  private async getContainerStatus(containerName: string): Promise<ContainerStatus> {
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: { name: [containerName] },
      });

      // Docker name filter does substring matching, so post-filter for exact match
      const match = containers.find(c =>
        c.Names?.some(n => n === `/${containerName}`)
      );

      if (!match) return 'unknown';
      return match.State === 'running' ? 'running' : 'stopped';
    } catch {
      return 'unknown';
    }
  }

  private fetchHtml(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const mod = parsed.protocol === 'https:' ? https : http;
      const req = mod.request(url, { rejectUnauthorized: false, timeout: METADATA_FETCH_TIMEOUT }, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const contentType = res.headers['content-type'] ?? '';
        if (!contentType.includes('text/html')) {
          reject(new Error('Not HTML'));
          res.resume();
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    });
  }

  private async fetchMetadata(url: string): Promise<WebAppMetadata> {
    const empty: WebAppMetadata = { title: null, description: null, faviconUrl: null };
    try {
      const html = await this.fetchHtml(url);
      const $ = cheerio.load(html);

      const title = $('title').first().text().trim() || null;

      const description =
        $('meta[name="description"]').attr('content')?.trim() ||
        $('meta[property="og:description"]').attr('content')?.trim() ||
        null;

      let faviconUrl: string | null = null;
      const iconLink =
        $('link[rel="icon"]').attr('href') ||
        $('link[rel="shortcut icon"]').attr('href');

      if (iconLink) {
        try {
          faviconUrl = new URL(iconLink, url).href;
        } catch {
          faviconUrl = null;
        }
      } else {
        // Fallback to /favicon.ico
        try {
          const base = new URL(url);
          faviconUrl = `${base.origin}/favicon.ico`;
        } catch {
          faviconUrl = null;
        }
      }

      return { title, description, faviconUrl };
    } catch (error) {
      logger.debug({ error, url }, 'Failed to fetch web app metadata');
      return empty;
    }
  }
}

export const webAppService = new WebAppService();
