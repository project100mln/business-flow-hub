import { Badge } from "@/components/ui/badge";
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
}: {
  items: ServiceRequestWithRefs[];
  onOpen: (r: ServiceRequestWithRefs) => void;
}) {
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
