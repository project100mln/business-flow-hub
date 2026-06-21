import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Crown, TrendingUp, TrendingDown, Wallet, Wrench, CreditCard, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/app/owner")({ component: Owner });

function StatCard({ icon: Icon, label, value, hint, tone = "primary" }: { icon: any; label: string; value: string; hint?: string; tone?: "primary" | "success" | "destructive" }) {
  const toneClass = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-primary";
  return (
    <div className="rounded-2xl border border-border bg-gradient-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`inline-flex size-8 items-center justify-center rounded-lg bg-accent ${toneClass}`}><Icon className="size-4" /></div>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Owner() {
  const { hasRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !hasRole("admin")) navigate({ to: "/app/dashboard" });
  }, [loading, hasRole, navigate]);

  const { data } = useQuery({
    queryKey: ["owner-dashboard"],
    enabled: hasRole("admin"),
    queryFn: async () => {
      const [deals, txs, installs, installments, payments, service] = await Promise.all([
        supabase.from("deals").select("amount, stage"),
        supabase.from("transactions").select("type, amount"),
        supabase.from("installations").select("id, status"),
        supabase.from("installments").select("id, total_amount, status"),
        supabase.from("installment_payments").select("amount, status, due_date"),
        supabase.from("service_requests").select("cost, status"),
      ]);
      const won = (deals.data ?? []).filter((d) => d.stage === "won").reduce((s, d) => s + Number(d.amount), 0);
      const income = (txs.data ?? []).filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const expense = (txs.data ?? []).filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      const installsDone = (installs.data ?? []).filter((i) => i.status === "completed").length;
      const installsPlanned = (installs.data ?? []).filter((i) => i.status === "scheduled").length;
      const instTotal = (installments.data ?? []).reduce((s, i) => s + Number(i.total_amount), 0);
      const overdue = (payments.data ?? []).filter((p) => p.status !== "paid" && new Date(p.due_date) < new Date());
      const overdueAmount = overdue.reduce((s, p) => s + Number(p.amount), 0);
      const serviceRevenue = (service.data ?? []).filter((s) => s.status === "done").reduce((s, x) => s + Number(x.cost || 0), 0);
      return { won, income, expense, balance: income - expense, installsDone, installsPlanned, instTotal, overdueAmount, overdueCount: overdue.length, serviceRevenue };
    },
  });

  const fmt = (n: number) => `${new Intl.NumberFormat("ru-RU").format(Math.round(n))} ₸`;

  if (!hasRole("admin")) return null;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow"><Crown className="size-5 text-primary-foreground" /></div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Кабинет собственника</h1>
          <p className="mt-1 text-sm text-muted-foreground">Стратегическая сводка PURE-HOME OS.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Wallet} label="Чистая прибыль" value={fmt(data?.balance ?? 0)} hint="доход − расход" tone={(data?.balance ?? 0) >= 0 ? "success" : "destructive"} />
        <StatCard icon={TrendingUp} label="Доход" value={fmt(data?.income ?? 0)} tone="success" />
        <StatCard icon={TrendingDown} label="Расход" value={fmt(data?.expense ?? 0)} tone="destructive" />
        <StatCard icon={Wrench} label="Установок выполнено" value={String(data?.installsDone ?? 0)} hint={`${data?.installsPlanned ?? 0} запланировано`} />
        <StatCard icon={CreditCard} label="Портфель рассрочек" value={fmt(data?.instTotal ?? 0)} />
        <StatCard icon={AlertTriangle} label="Просроченные платежи" value={fmt(data?.overdueAmount ?? 0)} hint={`${data?.overdueCount ?? 0} платежей`} tone="destructive" />
        <StatCard icon={TrendingUp} label="Закрытых сделок" value={fmt(data?.won ?? 0)} tone="success" />
        <StatCard icon={Wrench} label="Сервисная выручка" value={fmt(data?.serviceRevenue ?? 0)} />
      </div>
    </div>
  );
}
