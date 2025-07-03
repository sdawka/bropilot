/**
 * SyncOptimizer: Performance optimization for large codebases.
 * - File watching (chokidar)
 * - Checksum-based change detection
 * - Parallel analysis
 * - Caching
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import chokidar from 'chokidar';

export class SyncOptimizer {
  private checksumCache: Map<string, string> = new Map();
  private changedFiles: Set<string> = new Set();

  /**
   * Calculate a checksum for a file.
   */
  async calculateFileChecksum(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get cached checksum for a file.
   */
  getChecksum(filePath: string): string | undefined {
    return this.checksumCache.get(filePath);
  }

  /**
   * Set cached checksum for a file.
   */
  setChecksum(filePath: string, checksum: string): void {
    this.checksumCache.set(filePath, checksum);
  }

  /**
   * Watch files for changes using chokidar.
   */
  watchFiles(dirs: string[], onChange: (file: string) => void): void {
    const watcher = chokidar.watch(dirs, { ignoreInitial: true });
    watcher.on('change', (filePath: string) => {
      this.changedFiles.add(filePath);
      onChange(filePath);
    });
    watcher.on('add', (filePath: string) => {
      this.changedFiles.add(filePath);
      onChange(filePath);
    });
    watcher.on('unlink', (filePath: string) => {
      this.changedFiles.add(filePath);
      onChange(filePath);
    });
  }

  /**
   * Get the set of changed files since last sync.
   */
  getChangedFiles(): string[] {
    return Array.from(this.changedFiles);
  }

  /**
   * Analyze files in parallel chunks.
   */
  async analyzeInChunks<T>(
    files: string[],
    chunkSize: number,
    analyzeFn: (file: string) => Promise<T>,
  ): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < files.length; i += chunkSize) {
      const chunk = files.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map(analyzeFn));
      results.push(...chunkResults);
    }
    return results;
  }
}
