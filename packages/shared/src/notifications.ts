import { z } from "zod";

/** AGENTS.md §4: cursor pagination — this module is the first to actually use it. */
export const ListNotificationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(20),
    cursor: z.string().uuid().optional(),
  })
  .strict();
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuerySchema>;
