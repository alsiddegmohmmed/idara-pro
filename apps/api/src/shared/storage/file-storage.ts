import type { Readable } from "node:stream";

/**
 * ADR-0005: v1 has one implementation (LocalDiskStorage). Every module that
 * touches uploaded files goes through this port, never the filesystem
 * directly — the same "one sanctioned path" pattern as TenantDatabase.
 */
export const FILE_STORAGE = Symbol("FILE_STORAGE");

export interface FileStorage {
  put(key: string, data: Readable | Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
