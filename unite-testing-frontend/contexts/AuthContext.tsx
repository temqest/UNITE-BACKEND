"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AuthAPI } from "../services/api";

type Role = "admin" | "coordinator" | "stakeholder" | null;

interface AuthState {
  token: string | null;
  role: Role;
  user: any | null;
  loginStaff: (email: string, password: string) => Promise<void>;
  loginStakeholder: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [user, setUser] = useState<any | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("unite_auth") : null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { token: string; role: Role; user: any };
        setToken(parsed.token);
        setRole(parsed.role);
        setUser(parsed.user);
      } catch {}
    }
  }, []);

  const persist = (next: { token: string; role: Role; user: any }) => {
    setToken(next.token);
    setRole(next.role);
    setUser(next.user);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("unite_auth", JSON.stringify(next));
    }
  };

  const clear = () => {
    setToken(null);
    setRole(null);
    setUser(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("unite_auth");
    }
  };

  const value = useMemo<AuthState>(
    () => ({
      token,
      role,
      user,
      loginStaff: async (email, password) => {
        const res = await AuthAPI.loginStaff(email, password);
        const user = (res as any)?.data ?? null;
        const inferredRole: Role = user?.staff_type === 'Coordinator' ? 'coordinator' : 'admin';
        persist({ token: (res as any).token, role: inferredRole, user });
      },
      loginStakeholder: async (email, password) => {
        const res = await AuthAPI.loginStakeholder(email, password);
        persist({ token: res.token, role: (res as any).role ?? "stakeholder", user: (res as any).user ?? null });
      },
      logout: clear,
    }),
    [token, role, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}


