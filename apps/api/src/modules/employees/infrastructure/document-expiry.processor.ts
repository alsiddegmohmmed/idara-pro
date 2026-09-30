import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { CheckDocumentExpiriesUseCase } from "../application/check-document-expiries.use-case";
import { CheckFileExpiriesUseCase } from "../application/check-file-expiries.use-case";

/** @nestjs/bullmq's real shape: extend WorkerHost, override process() — not
 * the older @nestjs/bull style of a bare @Processor class. Worker-only
 * (docs/adr/0006), registered via document-expiry-job.module.ts. */
@Processor("document-expiry")
export class DocumentExpiryProcessor extends WorkerHost {
  constructor(
    private readonly checkDocumentExpiries: CheckDocumentExpiriesUseCase,
    private readonly checkFileExpiries: CheckFileExpiriesUseCase,
  ) {
    super();
  }

  /** The daily reminders run: document expiries, then contract / probation / insurance ends. */
  async process(_job: Job): Promise<void> {
    await this.checkDocumentExpiries.runForAllCompanies();
    await this.checkFileExpiries.runForAllCompanies();
  }
}
