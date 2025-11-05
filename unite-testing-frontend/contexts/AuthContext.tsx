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
  // Initialize auth state synchronously from localStorage so initial render
  // matches the persisted auth state and avoids hook-order/hydration races.
  // This runs only on the client because this is a "use client" component.
  const initialAuth = (() => {
    try {
      if (typeof window === 'undefined') return { token: null, role: null, user: null };
      const stored = window.localStorage.getItem('unite_auth');
      if (!stored) return { token: null, role: null, user: null };
      const parsed = JSON.parse(stored) as { token?: string; role?: Role; user?: any };
      return { token: parsed.token ?? null, role: parsed.role ?? null, user: parsed.user ?? null };
    } catch (e) {
      return { token: null, role: null, user: null };
    }
  })();

  const [token, setToken] = useState<string | null>(initialAuth.token);
  const [role, setRole] = useState<Role>(initialAuth.role);
  const [user, setUser] = useState<any | null>(initialAuth.user);

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
        // Backend returns { success: true, data: stakeholder, token }
        const userPayload = (res as any)?.data ?? (res as any)?.stakeholder ?? (res as any)?.user ?? null;
        persist({ token: (res as any).token, role: "stakeholder", user: userPayload });
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


