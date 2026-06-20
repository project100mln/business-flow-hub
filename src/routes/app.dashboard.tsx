import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Users, Briefcase, Wrench, Boxes, Wallet, TrendingUp, TrendingDown, Repeat } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line } from "recharts";

export const Route = createFileRoute("/app/dashboard")({ component: Dashboard });

function StatCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-gradient-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [clients, calls, deals, installs, products, txs, wonDeals] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("calls").select("id", { count: "exact", head: true }),
        supabase.from("deals").select("amount, stage"),
        supabase.from("installations").select("id, status"),
        supabase.from("products").select("stock, type, price"),
        supabase.from("transactions").select("type, amount"),
        supabase.from("deals").select("amount, stage, closed_at, created_at, products(type, price)").in("stage", ["won", "installation"]),
      ]);
      const dealsArr = deals.data ?? [];
      const won = dealsArr.filter((d) => d.stage === "won").reduce((s, d) => s + Number(d.amount), 0);
      const stockTotal = (products.data ?? []).reduce((s, p) => s + (p.stock ?? 0), 0);
      const income = (txs.data ?? []).filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const expense = (txs.data ?? []).filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

      // Last 6 months sales by category
      const now = new Date();
      const buckets: { key: string; label: string; vacuums: number; filters: number; ts: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], vacuums: 0, filters: 0, ts: d.getTime() });
      }
      let filterUnits = 0;
      let filterAvgPrice = 0;
      let filterCount = 0;
      (wonDeals.data ?? []).forEach((d: any) => {
        const dt = new Date(d.closed_at || d.created_at);
        const key = `${dt.getFullYear()}-${dt.getMonth()}`;
        const b = buckets.find((x) => x.key === key);
        const type = d.products?.type;
        const amount = Number(d.amount);
        if (b) {
          if (type === "vacuum") b.vacuums += amount;
          else if (type === "filter") b.filters += amount;
        }
        if (type === "filter") {
          filterUnits += 1;
          filterAvgPrice += Number(d.products?.price ?? amount);
          filterCount += 1;
        }
      });
      const avgFilter = filterCount > 0 ? filterAvgPrice / filterCount : 0;

      // Forecast: repeat consumables revenue for next 6 months.
      // Assumption: each past filter sale generates a repeat order ~180 days later.
      const forecast: { label: string; revenue: number }[] = [];
      for (let i = 1; i <= 6; i++) {
        const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const repeatWindowStart = new Date(target.getFullYear(), target.getMonth() - 6, 1);
        const repeatWindowEnd = new Date(target.getFullYear(), target.getMonth() - 5, 1);
        const cohort = (wonDeals.data ?? []).filter((d: any) => {
          if (d.products?.type !== "filter") return false;
          const dt = new Date(d.closed_at || d.created_at);
          return dt >= repeatWindowStart && dt < repeatWindowEnd;
        }).length;
        // 70% repeat rate assumption
        forecast.push({ label: MONTHS[target.getMonth()], revenue: Math.round(cohort * avgFilter * 0.7) });
      }
      const forecastTotal = forecast.reduce((s, f) => s + f.revenue, 0);

      return {
        clients: clients.count ?? 0,
        calls: calls.count ?? 0,
        dealsCount: dealsArr.length,
        wonAmount: won,
        installs: (installs.data ?? []).length,
        scheduledInstalls: (installs.data ?? []).filter((i) => i.status === "scheduled").length,
        stockTotal,
        income, expense, balance: income - expense,
        salesByCategory: buckets.map((b) => ({ label: b.label, "Пылесосы": b.vacuums, "Фильтры": b.filters })),
        forecast,
        forecastTotal,
        filterUnits,
      };
    },
  });

  const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Дашборд</h1>
        <p className="mt-1 text-sm text-muted-foreground">Сводка по всему бизнесу в реальном времени.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Клиенты" value={fmt(data?.clients ?? 0)} hint="всего в базе" />
        <StatCard icon={Phone} label="Звонки" value={fmt(data?.calls ?? 0)} hint="всего совершено" />
        <StatCard icon={Briefcase} label="Сделок" value={fmt(data?.dealsCount ?? 0)} hint={`закрыто на ${fmt(data?.wonAmount ?? 0)} ₽`} />
        <StatCard icon={Wrench} label="Установки" value={fmt(data?.installs ?? 0)} hint={`${data?.scheduledInstalls ?? 0} запланированы`} />
        <StatCard icon={Boxes} label="Товары на складе" value={fmt(data?.stockTotal ?? 0)} hint="штук всего" />
        <StatCard icon={TrendingUp} label="Доход" value={`${fmt(data?.income ?? 0)} ₽`} />
        <StatCard icon={TrendingDown} label="Расход" value={`${fmt(data?.expense ?? 0)} ₽`} />
        <StatCard icon={Wallet} label="Баланс" value={`${fmt(data?.balance ?? 0)} ₽`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-gradient-surface p-5 shadow-card">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-sm text-muted-foreground">Продажи по категориям</div>
              <div className="text-lg font-semibold mt-0.5">Пылесосы vs Фильтры</div>
            </div>
            <div className="text-xs text-muted-foreground">за 6 месяцев</div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.salesByCategory ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v/1000).toFixed(0)}к`} />
                <Tooltip contentStyle={{ background: "hsl(var(--surface-elevated))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: number) => `${fmt(v)} ₽`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Пылесосы" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Фильтры" fill="hsl(var(--accent-foreground))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-gradient-surface p-5 shadow-card">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-sm text-muted-foreground flex items-center gap-1.5"><Repeat className="size-3.5" />Прогноз повторных продаж</div>
              <div className="text-lg font-semibold mt-0.5">{fmt(data?.forecastTotal ?? 0)} ₽</div>
            </div>
            <div className="text-xs text-muted-foreground">расходники, цикл 180 дн.</div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.forecast ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v/1000).toFixed(0)}к`} />
                <Tooltip contentStyle={{ background: "hsl(var(--surface-elevated))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: number) => `${fmt(v)} ₽`} />
                <Line type="monotone" dataKey="revenue" name="Прогноз ₽" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Основано на {data?.filterUnits ?? 0} продажах фильтров × 70% удержание.</div>
        </div>
      </div>
    </div>
  );
}
