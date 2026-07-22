import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  BOARD_GROUPS,
  SERVICE_STATUS,
  STATUS_TONE,
  PRIORITY,
  fmtDateTime,
  type ServiceRequestWithRefs,
} from "@/lib/service";

export function ServiceBoard({
  items,
  onOpen,
  isLoading = false,
  error = null,
  onRetry,
}: {
  items: ServiceRequestWithRefs[];
  onOpen: (r: ServiceRequestWithRefs) => void;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  if (isLoading && items.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Загружаем заявки…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="size-4" /> Не удалось загрузить заявки: {error.message}
        </div>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Повторить
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {BOARD_GROUPS.map((g) => {
        const cards = items.filter((i) => g.statuses.includes(i.status));
        return (
          <div
            key={g.key}
            className="rounded-2xl border border-border bg-gradient-surface shadow-card p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">{g.title}</h3>
              <Badge variant="outline">{cards.length}</Badge>
            </div>
            <div className="space-y-2">
              {cards.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">Пусто</p>
              )}
              {cards.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onOpen(r)}
                  className="w-full text-left rounded-xl border border-border bg-background/60 p-2.5 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium line-clamp-2">{r.issue}</span>
                    <Badge variant="outline" className={STATUS_TONE[r.status]}>
                      {SERVICE_STATUS[r.status] || r.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.clients?.full_name || r.objects?.name || "—"}
                    {r.scheduled_at ? ` · ${fmtDateTime(r.scheduled_at)}` : ""}
                  </div>
                  {r.priority !== "normal" && (
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {PRIORITY[r.priority] || r.priority}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
