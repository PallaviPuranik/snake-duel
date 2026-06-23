import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getService } from "./index";
import type { User } from "./types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const svc = getService();
    setUser(svc.currentUser());
    setLoading(false);
    return svc.onAuthChange(setUser);
  }, []);

  return <Ctx.Provider value={{ user, loading }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
