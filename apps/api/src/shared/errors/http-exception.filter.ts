import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { BusinessRuleError, ForbiddenError, NotFoundError } from "./errors";

interface ErrorShape {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const { status, code, message, details } = this.resolve(exception);
    response.status(status).send({ error: { code, message, details } });
  }

  private resolve(exception: unknown): ErrorShape {
    if (exception instanceof NotFoundError) {
      return { status: HttpStatus.NOT_FOUND, code: exception.code, message: exception.message };
    }
    if (exception instanceof ForbiddenError) {
      return { status: HttpStatus.FORBIDDEN, code: exception.code, message: exception.message };
    }
    if (exception instanceof BusinessRuleError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "string" ? body : ((body as { message?: string | string[] }).message ?? exception.message);
      return { status, code: "http_error", message: Array.isArray(message) ? message.join("; ") : message };
    }
    // Unknown/unexpected error: never leak internals (Prisma errors, stack traces) to the client,
    // but always log them server-side so they can be diagnosed.
    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: "internal_error", message: "Internal server error" };
  }
}
