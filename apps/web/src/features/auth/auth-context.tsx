import { ROLE_SCOPES, type RoleScope } from "@idara-pro/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "@/lib/api";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: Status;
  claims: api.AccessTokenClaims | null;
  login: (email: string, password: string) => Promise<void>;
  acceptInvitation: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Does the user hold `permission` (optionally at least at `minScope`: own < team < branch < company)?
   * UI-hiding only — the server enforces every permission and scope itself.
   */
  can: (permission: string, minScope?: RoleScope) => boolean;
  /** The widest scope the user holds `permission` at, or null. */
  scopeOf: (permission: string) => RoleScope | null;
  /** Branches whose people the user reaches: `all`, or a list (a branch filter only makes sense with 2+). */
  branchReach: { all: boolean; branchIds: string[] };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<Status>("loading");
  const [claims, setClaims] = useState<api.AccessTokenClaims | null>(null);
  const [access, setAccess] = useState<Record<string, RoleScope>>({});
  const [branchReach, setBranchReach] = useState<{ all: boolean; branchIds: string[] }>({ all: false, branchIds: [] });

  /** A session only counts as established once we also know what it may do — no half-rendered shell. */
  const establish = useCallback(async () => {
    const next = api.readClaims();
    // If the lookup fails the UI shows nothing extra; the server still decides every call.
    const view = await api.fetchAccess().catch(() => null);
    setAccess(view?.permissions ?? {});
    setBranchReach({ all: view?.allBranches ?? false, branchIds: view?.branchIds ?? [] });
    setClaims(next);
    setStatus("authenticated");
  }, []);

  // On page load, restore the session from the refresh cookie if there is one.
  useEffect(() => {
    void api.refreshSession().then(async (ok) => {
      if (ok) await establish();
      else setStatus("anonymous");
    });
  }, [establish]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api.login(email, password);
      await establish();
    },
    [establish],
  );

  const acceptInvitation = useCallback(
    async (token: string, password: string) => {
      await api.acceptInvitation(token, password);
      await establish();
    },
    [establish],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setClaims(null);
    setAccess({});
    setBranchReach({ all: false, branchIds: [] });
    setStatus("anonymous");
  }, []);

  const scopeOf = useCallback((permission: string) => access[permission] ?? null, [access]);
  const can = useCallback(
    (permission: string, minScope?: RoleScope) => {
      const scope = access[permission];
      if (!scope) return false;
      return !minScope || ROLE_SCOPES.indexOf(scope) >= ROLE_SCOPES.indexOf(minScope);
    },
    [access],
  );

  const value = useMemo(
    () => ({ status, claims, login, acceptInvitation, logout, can, scopeOf, branchReach }),
    [status, claims, login, acceptInvitation, logout, can, scopeOf, branchReach],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
