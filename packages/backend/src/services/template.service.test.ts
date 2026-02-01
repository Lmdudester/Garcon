import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { TemplateSchema } from '@garcon/shared';

describe('Template validation', () => {
  it('validates a correct minecraft template', () => {
    const template = {
      id: 'minecraft',
      name: 'Minecraft Java Edition',
      description: 'Minecraft Java Edition server using OpenJDK 17',
      docker: {
        baseImage: 'openjdk:17-slim',
        mountPath: '/server'
      },
      execution: {
        executable: 'server.jar',
        command: 'java -Xmx{MEMORY} -Xms{MEMORY} -jar server.jar nogui',
        stopTimeout: 30
      },
      defaultPorts: [
        { container: 25565, protocol: 'tcp', description: 'Minecraft server port' }
      ],
      variables: [
        { name: 'MEMORY', description: 'Server memory allocation', defaultValue: '2G', required: false }
      ],
      requiredFiles: ['server.jar']
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(true);
  });

  it('validates a correct valheim template', () => {
    const template = {
      id: 'valheim',
      name: 'Valheim Dedicated Server',
      docker: {
        baseImage: 'ubuntu:22.04',
        mountPath: '/server'
      },
      execution: {
        executable: 'valheim_server.x86_64',
        command: './valheim_server.x86_64 -nographics -batchmode'
      }
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(true);
  });

  it('rejects template without required fields', () => {
    const template = {
      id: 'invalid',
      // missing name
      docker: {
        baseImage: 'ubuntu:22.04'
        // missing mountPath
      },
      execution: {
        // missing executable and command
      }
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(false);
  });

  it('rejects template with invalid port', () => {
    const template = {
      id: 'invalid',
      name: 'Invalid',
      docker: {
        baseImage: 'ubuntu:22.04',
        mountPath: '/server'
      },
      execution: {
        executable: 'server',
        command: './server'
      },
      defaultPorts: [
        { container: 99999, protocol: 'tcp' } // Invalid port number
      ]
    };

    const result = TemplateSchema.safeParse(template);
    expect(result.success).toBe(false);
  });
});
