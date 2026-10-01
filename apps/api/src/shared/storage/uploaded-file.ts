/** A file received in a multipart upload, before its real type is sniffed. */
export interface UploadedFile {
  buffer: Buffer;
  /** What the client claimed — never trusted (see detectFileType). */
  contentType: string;
  originalFilename: string;
}
