/**
 * Injected everywhere "now" matters (AGENTS.md §3 rule 4) so domain/application
 * tests can control time instead of reading the system clock directly.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export const CLOCK = Symbol("CLOCK");
