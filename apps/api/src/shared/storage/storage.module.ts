import { Global, Module } from "@nestjs/common";
import { FILE_STORAGE } from "./file-storage";
import { LocalDiskStorage } from "./local-disk-storage";

@Global()
@Module({
  providers: [{ provide: FILE_STORAGE, useClass: LocalDiskStorage }],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
