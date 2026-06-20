import { createFileRoute, Link } from "@tanstack/react-router";
import { Phone, Users, ListChecks, Wrench, Wallet, Boxes, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Orbit — единая система управления бизнесом" },
      { name: "description", content: "Колл-центр, CRM, задачи, склад и финансы для продаж пылесосов и установки фильтров." },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Phone, title: "Колл-центр", desc: "Исходящие звонки, статусы, перезвоны и заметки оператора." },
  { icon: Users, title: "CRM клиентов", desc: "Единая база клиентов, история контактов, ответственный менеджер." },
  { icon: Sparkles, title: "Презентации пылесосов", desc: "Воронка сделок: лид → презентация → продажа." },
  { icon: Wrench, title: "Установки фильтров", desc: "Расписание выездов мастеров, статусы установок." },
  { icon: Boxes, title: "Склад", desc: "Учёт пылесосов, фильтров и аксессуаров." },
  { icon: Wallet, title: "Финансы", desc: "Доходы и расходы, привязка к сделкам, отчётность." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-gradient-primary shadow-glow" />
            <span className="text-lg font-semibold tracking-tight">Orbit</span>
          </div>
          <Button asChild variant="default" className="bg-gradient-primary hover:opacity-90">
            <Link to="/auth">Войти</Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-6 pt-24 pb-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-success" /> Готово к работе
            </div>
            <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight md:text-6xl">
              Единая система управления вашим бизнесом
            </h1>
            <p className="mt-6 text-balance text-lg text-muted-foreground">
              Колл-центр, CRM, задачи, склад и финансы — в одном тёмном минималистичном интерфейсе.
              Создано для команд, продающих пылесосы и устанавливающих фильтры.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild size="lg" className="bg-gradient-primary hover:opacity-90 shadow-glow">
                <Link to="/auth">Начать работу <ArrowRight className="ml-1 size-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#features">Возможности</a>
              </Button>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-6 pb-32">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="group rounded-2xl border border-border bg-gradient-surface p-6 shadow-card transition hover:border-border-strong">
                <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-base font-medium">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Orbit. Все права защищены.
        </div>
      </footer>
    </div>
  );
}
