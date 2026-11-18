/**
 * Read response bodies without trusting the server about their size.
 * Bytes are counted after decompression, so a small gzip-compressed response
 * cannot expand into gigabytes of memory.
 */

import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { Transform } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

/**
 * Encodings we inflate ourselves (and so are the only ones we advertise)
 */
const INFLATERS: Record<string, () => Transform> = {
  gzip: () => createGunzip(),
  'x-gzip': () => createGunzip(),
  deflate: () => createInflate(),
  br: () => createBrotliDecompress(),
};

/**
 * fetch() for responses read with readBodyLimited / readBodyPrefix. Bun would otherwise
 * inflate a compressed body in full on its own, however little of it is read: a 0.8 MB
 * gzip response took over 500 MB that way.
 */
export function fetchRaw(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept-Encoding', 'gzip, deflate, br');
  return fetch(url, { ...init, headers, decompress: false } as RequestInit);
}

export class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Response body exceeds ${maxBytes} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

/**
 * Stop reading the rest of a body that is not needed, so the connection is released
 */
export function discardBody(response: Response): void {
  response.body?.cancel().catch(() => {});
}

function declaredLength(response: Response): number | null {
  const header = response.headers.get('content-length');
  if (header === null) return null;
  const length = Number(header);
  return Number.isFinite(length) && length >= 0 ? length : null;
}

/**
 * Read the whole body, or throw BodyTooLargeError as soon as it passes `maxBytes`
 */
export async function readBodyLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const length = declaredLength(response);
  if (length !== null && length > maxBytes) {
    discardBody(response);
    throw new BodyTooLargeError(maxBytes);
  }

  const { buffer, complete } = await readChunks(response, maxBytes);
  if (!complete) {
    throw new BodyTooLargeError(maxBytes);
  }
  return buffer;
}

/**
 * Read the body only up to `maxBytes`, or until `marker` (ASCII, matched case-insensitively)
 * has been seen. Whatever was read is returned and the rest of the body is never downloaded.
 */
export async function readBodyPrefix(
  response: Response,
  maxBytes: number,
  marker?: string
): Promise<Buffer> {
  const { buffer } = await readChunks(response, maxBytes, marker?.toLowerCase());
  return buffer;
}

/**
 * The body as decompressed chunks. Compressed bodies are inflated as they are read, so a
 * reader that stops early never inflates the rest. `stop` releases the connection.
 */
function decodedChunks(
  response: Response,
  body: ReadableStream<Uint8Array>
): {
  chunks: AsyncIterable<Uint8Array>;
  stop: () => void;
} {
  const encoding = (response.headers.get('content-encoding') ?? '').trim().toLowerCase();

  if (encoding === '' || encoding === 'identity') {
    const reader = body.getReader();
    return {
      chunks: {
        async *[Symbol.asyncIterator]() {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            yield value;
          }
        },
      },
      stop: () => {
        reader.cancel().catch(() => {});
      },
    };
  }

  const createInflater = INFLATERS[encoding];
  if (!createInflater) {
    body.cancel().catch(() => {});
    throw new Error(`Unsupported content-encoding: ${encoding}`);
  }

  const source = Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>);
  const inflater = createInflater();
  source.on('error', (error) => inflater.destroy(error));
  source.pipe(inflater);
  return {
    chunks: inflater,
    stop: () => {
      inflater.destroy();
      source.destroy();
    },
  };
}

async function readChunks(
  response: Response,
  maxBytes: number,
  marker?: string
): Promise<{ buffer: Buffer; complete: boolean }> {
  if (!response.body) {
    return { buffer: Buffer.alloc(0), complete: true };
  }

  const { chunks: body, stop } = decodedChunks(response, response.body);
  const chunks: Uint8Array[] = [];
  let total = 0;
  // Tail of the previous chunk, so a marker split across two chunks is still found
  let carry = '';

  try {
    for await (const value of body) {
      const room = maxBytes - total;
      if (value.length > room) {
        // Keep what fits; the caller decides whether a cut-off body is acceptable
        if (room > 0) {
          chunks.push(value.subarray(0, room));
          total += room;
        }
        return { buffer: Buffer.concat(chunks, total), complete: false };
      }

      chunks.push(value);
      total += value.length;

      if (marker) {
        const text =
          carry + Buffer.from(value.buffer, value.byteOffset, value.length).toString('latin1');
        if (text.toLowerCase().includes(marker)) {
          return { buffer: Buffer.concat(chunks, total), complete: false };
        }
        carry = text.slice(-(marker.length - 1));
      }
    }
    return { buffer: Buffer.concat(chunks, total), complete: true };
  } finally {
    // Stops downloading and inflating whatever is left (a no-op once the body has ended)
    stop();
  }
}
