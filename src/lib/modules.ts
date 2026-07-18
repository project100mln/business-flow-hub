// Single source of truth mapping app routes to company modules
// (companies.enabled_modules). Used by both the sidebar (to hide items) and the
// /app route guard (to block direct navigation to a disabled module).
//
// Routes not listed here (e.g. /app/dashboard, /app itself) have no module and
// are always available.
export const ROUTE_MODULES: { prefix: string; module: string }[] = [
  { prefix: "/app/hyla", module: "hyla_leads" },
  { prefix: "/app/calls", module: "cold_calls" },
  { prefix: "/app/clients", module: "clients" },
  { prefix: "/app/objects", module: "objects" },
  { prefix: "/app/deals", module: "deals" },
  { prefix: "/app/tasks", module: "tasks" },
  { prefix: "/app/coordinator", module: "service" },
  { prefix: "/app/service", module: "service" },
  { prefix: "/app/installations", module: "installations" },
  { prefix: "/app/installments", module: "installments" },
  { prefix: "/app/products", module: "warehouse" },
  { prefix: "/app/finance", module: "finance" },
  { prefix: "/app/team", module: "staff" },
  { prefix: "/app/owner", module: "owner" },
];

/** Returns the module key required for a given pathname, or undefined if the route is unguarded. */
export function moduleForPath(pathname: string): string | undefined {
  const match = ROUTE_MODULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  return match?.module;
}
