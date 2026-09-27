import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "../config/config.service";
import type { FileStorage } from "./file-storage";

@Injectable()
export class LocalDiskStorage implements FileStorage {
  private readonly rootDir: string;

  constructor(config: ConfigService) {
    this.rootDir = resolve(config.env.FILE_STORAGE_DIR);
  }

  private resolveSafePath(key: string): string {
    const fullPath = resolve(this.rootDir, key);
    // Defense in depth — keys are always server-generated (ADR-0005,
    // generateFileKey), never derived from user input, but this is the one
    // place a bug in that guarantee would actually matter.
    if (!fullPath.startsWith(this.rootDir + sep)) {
      throw new Error(`Invalid file key resolves outside storage root: ${key}`);
    }
    return fullPath;
  }

  async put(key: string, data: Readable | Buffer): Promise<void> {
    const fullPath = this.resolveSafePath(key);
    await mkdir(dirname(fullPath), { recursive: true });
    if (Buffer.isBuffer(data)) {
      await writeFile(fullPath, data);
    } else {
      await pipeline(data, createWriteStream(fullPath));
    }
  }

  async get(key: string): Promise<Readable> {
    return createReadStream(this.resolveSafePath(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolveSafePath(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolveSafePath(key));
      return true;
    } catch {
      return false;
    }
  }
}
