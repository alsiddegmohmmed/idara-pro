import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "@/lib/api";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  status: Status;
  claims: api.AccessTokenClaims | null;
  login: (email: string, password: string) => Promise<void>;
  acceptInvitation: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** UI-hiding only — the server enforces every permission itself. */
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<Status>("loading");
  const [claims, setClaims] = useState<api.AccessTokenClaims | null>(null);

  // On page load, restore the session from the refresh cookie if there is one.
  useEffect(() => {
    void api.refreshSession().then((ok) => {
      setClaims(ok ? api.readClaims() : null);
      setStatus(ok ? "authenticated" : "anonymous");
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await api.login(email, password);
    setClaims(api.readClaims());
    setStatus("authenticated");
  }, []);

  const acceptInvitation = useCallback(async (token: string, password: string) => {
    await api.acceptInvitation(token, password);
    setClaims(api.readClaims());
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setClaims(null);
    setStatus("anonymous");
  }, []);

  const can = useCallback((permission: string) => claims?.permissions.includes(permission) ?? false, [claims]);

  const value = useMemo(
    () => ({ status, claims, login, acceptInvitation, logout, can }),
    [status, claims, login, acceptInvitation, logout, can],
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
