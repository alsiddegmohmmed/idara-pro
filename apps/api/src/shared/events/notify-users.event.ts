/**
 * Generic "tell these users" event (docs/architecture/overview.md "Domain events"). Producers decide
 * *who* (they know managers, scopes, owners); the notifications module decides *how* (in-app row +
 * email). Keeps modules free of imports in either direction.
 */
export const NOTIFY_USERS_EVENT = "notify.users";

export interface NotifyUsersEvent {
  companyId: string;
  userIds: string[];
  /** e.g. "leave_requested", "custody_paid" — also the i18n key suffix `notifications.<type>`. */
  type: string;
  bodyParams: Record<string, string | number | null>;
  entity: string;
  entityId: string;
  /** Path in the web app the email button opens, e.g. "/leave?tab=approvals". */
  link: string;
}
