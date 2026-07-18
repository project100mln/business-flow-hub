import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "operator" | "installer" | "finance" | "coordinator";

// The multitenancy migration added user_roles.company_id and the companies
// table (with enabled_modules), but the generated Supabase types haven't been
// regenerated yet. Route just those queries through an untyped handle so we
// stay runtime-correct without hand-editing the generated types file.
const db = supabase as unknown as { from: (table: string) => any };

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<{ full_name: string | null } | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [enabledModules, setEnabledModules] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async (s: Session | null) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        const [{ data: r }, { data: p }] = await Promise.all([
          db.from("user_roles").select("role, company_id").eq("user_id", s.user.id),
          supabase.from("profiles").select("full_name").eq("id", s.user.id).maybeSingle(),
        ]);
        if (!mounted) return;
        const rows = (r ?? []) as { role: AppRole; company_id: string | null }[];
        setRoles(rows.map((x) => x.role));
        setProfile(p ?? null);

        const cid = rows.find((x) => x.company_id)?.company_id ?? null;
        setCompanyId(cid);

        if (cid) {
          const { data: c } = await db
            .from("companies")
            .select("enabled_modules")
            .eq("id", cid)
            .maybeSingle();
          if (!mounted) return;
          const mods = c?.enabled_modules;
          setEnabledModules(Array.isArray(mods) ? (mods as string[]) : null);
        } else {
          setEnabledModules(null);
        }
      } else {
        setRoles([]);
        setProfile(null);
        setCompanyId(null);
        setEnabledModules(null);
      }
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => load(s));
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const isAdminOrManager = hasRole("admin") || hasRole("manager");
  // Fail open: when the module list is unknown (no company yet, platform admin,
  // or still loading) don't hide anything, so nobody gets locked out of the UI.
  const hasModule = (m: string) => !enabledModules || enabledModules.includes(m);

  return {
    session,
    user: session?.user ?? null,
    roles,
    profile,
    companyId,
    enabledModules,
    loading,
    hasRole,
    isAdminOrManager,
    hasModule,
  };
}
