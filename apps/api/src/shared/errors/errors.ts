/**
 * Typed errors (AGENTS.md §4) — throw these instead of raw strings or Prisma
 * errors. The global exception filter maps them to the JSON error shape from
 * docs/architecture/overview.md: { error: { code, message, details } }.
 */

export class NotFoundError extends Error {
  constructor(
    message: string,
    readonly code: string = "not_found",
  ) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(
    message: string,
    readonly code: string = "forbidden",
  ) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class BusinessRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BusinessRuleError";
  }
}
