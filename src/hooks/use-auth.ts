import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "operator" | "installer" | "finance" | "coordinator";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<{ full_name: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async (s: Session | null) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        const [{ data: r }, { data: p }] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", s.user.id),
          supabase.from("profiles").select("full_name").eq("id", s.user.id).maybeSingle(),
        ]);
        if (!mounted) return;
        setRoles((r ?? []).map((x: { role: AppRole }) => x.role));
        setProfile(p ?? null);
      } else {
        setRoles([]); setProfile(null);
      }
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => load(s));
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const isAdminOrManager = hasRole("admin") || hasRole("manager");

  return { session, user: session?.user ?? null, roles, profile, loading, hasRole, isAdminOrManager };
}
