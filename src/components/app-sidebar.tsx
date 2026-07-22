import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Users, Building2, Briefcase, ListChecks, Wrench, LifeBuoy, CreditCard, Boxes, Wallet, LogOut, UserCog, Crown, Headphones, Sparkles } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

// `module` maps a menu item to a key in companies.enabled_modules. Items
// without a module (e.g. Дашборд) are always shown.
const salesItems = [
  { title: "Дашборд", url: "/app/dashboard", icon: LayoutDashboard },
  { title: "База обзвона", url: "/app/calls", icon: Headphones, module: "cold_calls" },
  { title: "Лиды", url: "/app/hyla", icon: Sparkles, module: "hyla_leads" },
  { title: "Клиенты", url: "/app/clients", icon: Users, module: "clients" },
  { title: "Объекты (B2B)", url: "/app/objects", icon: Building2, module: "objects" },
  { title: "Продажи", url: "/app/deals", icon: Briefcase, module: "deals" },
  { title: "Задачи", url: "/app/tasks", icon: ListChecks, module: "tasks" },
];

// Единый вход в модуль «Сервис» (доска, заявки, перезвоны, планы).
// Отдельный пункт «Заявки (Координатор)» удалён — координатор работает
// внутри модуля «Сервис» через существующие вкладки.
const serviceItems = [
  { title: "Установки", url: "/app/installations", icon: Wrench, module: "installations" },
  { title: "Сервис", url: "/app/service", icon: LifeBuoy, module: "service" },
  { title: "Рассрочки", url: "/app/installments", icon: CreditCard, module: "installments" },
];

const accountingItems = [
  { title: "Склад", url: "/app/products", icon: Boxes, module: "warehouse" },
  { title: "Финансы", url: "/app/finance", icon: Wallet, module: "finance", managerOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { profile, roles, isAdminOrManager, hasRole, hasModule } = useAuth();

  const isActive = (p: string) => currentPath === p || currentPath.startsWith(p + "/");

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const roleLabels: Record<string, string> = {
    admin: "Собственник",
    manager: "Менеджер",
    operator: "Колл-центр",
    installer: "Монтажник",
    finance: "Финансист",
    coordinator: "Координатор",
  };
  

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/app/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <div className="size-7 shrink-0 rounded-md bg-gradient-primary shadow-glow" />
          {!collapsed && <span className="text-sm font-semibold tracking-tight">PURE-HOME OS</span>}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Продажи</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {salesItems.filter((i) => !i.module || hasModule(i.module)).map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Сервис</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {serviceItems.filter((i) => !i.module || hasModule(i.module)).map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Учёт</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountingItems
                .filter((i) => !i.module || hasModule(i.module))
                .filter((i) => !i.managerOnly || isAdminOrManager || hasRole("finance"))
                .map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="size-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              {hasRole("admin") && hasModule("staff") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/app/team")}>
                    <Link to="/app/team" className="flex items-center gap-2">
                      <UserCog className="size-4" />
                      {!collapsed && <span>Сотрудники</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {hasRole("admin") && hasModule("owner") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/app/owner")}>
                    <Link to="/app/owner" className="flex items-center gap-2">
                      <Crown className="size-4" />
                      {!collapsed && <span>Собственник</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && (
          <div className="px-2 py-1.5">
            <div className="truncate text-xs font-medium">{profile?.full_name ?? "Сотрудник"}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {roles.map((r) => roleLabels[r] || r).join(", ") || "—"}
            </div>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start">
          <LogOut className="size-4" />{!collapsed && <span className="ml-2">Выйти</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
