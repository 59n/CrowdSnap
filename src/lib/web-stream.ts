import type { Readable } from 'stream';

/**
 * Turn a Node stream into a web stream without throwing if the browser
 * disconnects mid-download. Readable.toWeb crashes the process in that case.
 */
export function webStreamFromNode(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => {
        try {
          controller.enqueue(chunk);
        } catch {
          nodeStream.destroy();
        }
      });
      nodeStream.on('end', () => {
        try {
          controller.close();
        } catch {
          /* client already gone */
        }
      });
      nodeStream.on('error', () => {
        try {
          controller.close();
        } catch {
          /* client already gone */
        }
        nodeStream.destroy();
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}
