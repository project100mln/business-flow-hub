import { createFileRoute, Outlet, useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationsBell } from "@/components/notifications-bell";
import { useAuth } from "@/hooks/use-auth";
import { moduleForPath } from "@/lib/modules";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app")({
  ssr: false,
  component: AppLayout,
});

function ModuleDisabled() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-lg font-semibold">Модуль недоступен</div>
      <p className="max-w-sm text-sm text-muted-foreground">
        Этот раздел отключён для вашей компании. Обратитесь к администратору, если он должен быть доступен.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to="/app/dashboard">На дашборд</Link>
      </Button>
    </div>
  );
}

function AppLayout() {
  const { session, loading, hasModule } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  const requiredModule = moduleForPath(pathname);
  // hasModule fails open while modules are still loading / unknown, so a
  // disabled module is only blocked once we actually know the company's list.
  const moduleBlocked = requiredModule ? !hasModule(requiredModule) : false;

  if (loading || !session) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">Загрузка...</div>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border bg-surface/40 backdrop-blur px-4">
            <SidebarTrigger />
            <div className="h-5 w-px bg-border" />
            <div className="text-sm text-muted-foreground flex-1">PURE-HOME OS · Hyla, фильтры, воздухоочистители</div>
            <NotificationsBell />
          </header>
          <main className="flex-1 overflow-auto">
            {moduleBlocked ? <ModuleDisabled /> : <Outlet />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
