import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";

export function NotificationsBell() {
  const { session } = useAuth();
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    enabled: !!session,
    refetchInterval: 60_000,
    queryFn: async () =>
      (await supabase
        .from("notifications")
        .select("id, title, body, type, read_at, created_at, related_task_id")
        .order("created_at", { ascending: false })
        .limit(20)).data ?? [],
  });

  const unread = items.filter((n: any) => !n.read_at);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const ids = unread.map((n: any) => n.id);
      if (ids.length) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />
          {unread.length > 0 && (
            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] font-semibold text-primary-foreground flex items-center justify-center">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-sm font-medium">Уведомления</div>
          {unread.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAll.mutate()} className="h-7 text-xs">
              <CheckCheck className="size-3 mr-1" />Прочитать все
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-auto">
          {items.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">Нет уведомлений</div>
          )}
          {items.map((n: any) => (
            <button
              key={n.id}
              onClick={() => !n.read_at && markRead.mutate(n.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-border hover:bg-muted/40 transition ${
                n.read_at ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                {!n.read_at && <span className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{n.title}</div>
                  {n.body && <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{n.body}</div>}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("ru-RU")}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
