import net from 'net';
import { createChildLogger } from './logger.js';

const logger = createChildLogger('rcon');

const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_RESPONSE_VALUE = 0;

function encodePacket(id: number, type: number, body: string): Buffer {
  const bodyBuffer = Buffer.from(body, 'utf8');
  // size (4) + id (4) + type (4) + body + null (1) + null (1)
  const size = 4 + 4 + bodyBuffer.length + 1 + 1;
  const buffer = Buffer.alloc(4 + size);

  buffer.writeInt32LE(size, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  bodyBuffer.copy(buffer, 12);
  buffer.writeUInt8(0, 12 + bodyBuffer.length);
  buffer.writeUInt8(0, 13 + bodyBuffer.length);

  return buffer;
}

function decodePacket(buffer: Buffer): { size: number; id: number; type: number; body: string } {
  const size = buffer.readInt32LE(0);
  const id = buffer.readInt32LE(4);
  const type = buffer.readInt32LE(8);
  const body = buffer.toString('utf8', 12, 12 + size - 10);

  return { size, id, type, body };
}

export async function sendRconCommand(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs: number = 10000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let responseBuffer = Buffer.alloc(0);
    let authenticated = false;
    let requestId = 1;
    const authId = requestId++;
    const commandId = requestId++;

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`RCON connection timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.on('connect', () => {
      logger.debug({ host, port }, 'RCON connected, sending auth');
      socket.write(encodePacket(authId, SERVERDATA_AUTH, password));
    });

    socket.on('data', (data: Buffer) => {
      responseBuffer = Buffer.concat([responseBuffer, data]);

      // Process all complete packets in the buffer
      while (responseBuffer.length >= 4) {
        const packetSize = responseBuffer.readInt32LE(0);
        const totalSize = 4 + packetSize;

        if (responseBuffer.length < totalSize) {
          break; // Incomplete packet, wait for more data
        }

        const packetData = responseBuffer.subarray(4, totalSize);
        responseBuffer = responseBuffer.subarray(totalSize);

        const packet = decodePacket(Buffer.concat([Buffer.alloc(4), packetData]));
        // Re-decode with proper offset
        const id = packetData.readInt32LE(0);
        const type = packetData.readInt32LE(4);
        const body = packetData.toString('utf8', 8, 8 + packetSize - 10);

        if (!authenticated) {
          if (type === SERVERDATA_AUTH_RESPONSE) {
            if (id === -1) {
              clearTimeout(timer);
              socket.destroy();
              reject(new Error('RCON authentication failed'));
              return;
            }
            authenticated = true;
            logger.debug('RCON authenticated, sending command');
            socket.write(encodePacket(commandId, SERVERDATA_EXECCOMMAND, command));
          }
        } else {
          if (type === SERVERDATA_RESPONSE_VALUE && id === commandId) {
            clearTimeout(timer);
            socket.destroy();
            resolve(body);
            return;
          }
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`RCON connection error: ${err.message}`));
    });

    socket.on('close', () => {
      clearTimeout(timer);
      // If we haven't resolved/rejected yet, the connection closed unexpectedly
      // This is actually fine for shutdown commands — the server may close the connection
      if (authenticated) {
        resolve('');
      }
    });

    socket.connect(port, host);
  });
}
