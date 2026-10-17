/**
 * infra/storage/local-disk.storage.ts — Local disk implementation of ObjectStorage.
 * DOC2 §2.7.1, DOC3 §3.12, DOC3 §3.21.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ObjectStorage } from '../../core/ports';

export class LocalDiskStorage implements ObjectStorage {
  constructor(private readonly baseDir: string = path.resolve(process.cwd(), 'uploads')) {}

  private getFilePath(key: string): string {
    // Sanitize key to prevent path traversal
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDir, safeKey);
  }

  async put(key: string, buffer: Buffer, _mimeType: string): Promise<string> {
    void _mimeType;
    await fs.mkdir(this.baseDir, { recursive: true });
    const filePath = this.getFilePath(key);
    await fs.writeFile(filePath, buffer);
    return key;
  }

  async getSignedUrl(key: string, _expirySec = 300): Promise<string> {
    void _expirySec;
    // For local dev/demo, returns a local pseudo-signed endpoint
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `/api/v1/storage/${safeKey}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
