import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Phone, Users, Briefcase, ListChecks, Wrench, Boxes, Wallet, LogOut, UserCog } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const mainItems = [
  { title: "Дашборд", url: "/app/dashboard", icon: LayoutDashboard },
  { title: "Колл-центр", url: "/app/calls", icon: Phone },
  { title: "Клиенты", url: "/app/clients", icon: Users },
  { title: "Сделки", url: "/app/deals", icon: Briefcase },
  { title: "Задачи", url: "/app/tasks", icon: ListChecks },
  { title: "Установки", url: "/app/installations", icon: Wrench },
];

const stockItems = [
  { title: "Товары / Склад", url: "/app/products", icon: Boxes },
  { title: "Финансы", url: "/app/finance", icon: Wallet, managerOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { profile, roles, isAdminOrManager, hasRole } = useAuth();

  const isActive = (p: string) => currentPath === p || currentPath.startsWith(p + "/");

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/app/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <div className="size-7 shrink-0 rounded-md bg-gradient-primary shadow-glow" />
          {!collapsed && <span className="text-sm font-semibold tracking-tight">Orbit</span>}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Работа</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
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
              {stockItems
                .filter((i) => !i.managerOnly || isAdminOrManager)
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
              {hasRole("admin") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/app/team")}>
                    <Link to="/app/team" className="flex items-center gap-2">
                      <UserCog className="size-4" />
                      {!collapsed && <span>Сотрудники</span>}
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
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{roles.join(", ") || "—"}</div>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start">
          <LogOut className="size-4" />{!collapsed && <span className="ml-2">Выйти</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
