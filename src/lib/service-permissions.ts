// Централизованные прикладные права модуля «Сервис».
// UI (кнопки/вкладки/меню) и мутации должны использовать ЭТУ матрицу,
// а не разбросанные сравнения `role === '...'`.
//
// ВАЖНО: это НЕ замена RLS. Реальная защита данных живёт в БД. Здесь мы
// только скрываем действия и рано отклоняем недопустимые мутации, чтобы
// не бить в базу, если её всё равно отклонит политика.
import type { AppRole } from "@/hooks/use-auth";

export type ServiceTab = "board" | "all" | "callbacks" | "plans";

export type ServiceCapabilities = {
  canViewService: boolean;
  canCreateRequest: boolean;
  canEditRequest: boolean;
  canAssignRequest: boolean;
  canChangeStatus: boolean;
  canManageCallbacks: boolean;
  canManagePlans: boolean;
  canDeletePlan: boolean;
  canDeleteRequest: boolean;
  canViewServiceReports: boolean;
  // Право менять финансовые поля заявки (стоимость и т.п.). У оператора его
  // нет: он может редактировать заявку, но не изменять цену. Ограничение
  // одновременно скрывает поле и вырезает его из payload мутации. Реальная
  // защита — RLS/триггер БД (см. серверный гэп в отчёте).
  canEditFinancialFields: boolean;
  // Исполнитель (installer): показывать в UI только заявки, назначенные
  // ему. Это ТОЛЬКО клиентское сужение — RLS должна гарантировать это на
  // сервере отдельно (см. финальный отчёт про серверный гэп).
  onlyAssignedInUI: boolean;
  tabs: ServiceTab[];
};

export const DENIED_MESSAGE = "Недостаточно прав для этого действия";

// Единый источник матрицы. Роли — только те, что уже существуют в проекте
// (admin/manager/coordinator/operator/installer/finance).
export function getServiceCapabilities(roles: AppRole[]): ServiceCapabilities {
  const has = (r: AppRole) => roles.includes(r);
  const isAdmin = has("admin");
  const isManager = has("manager");
  const isCoordinator = has("coordinator");
  const isOperator = has("operator");
  const isInstaller = has("installer");

  const isStaff = isAdmin || isManager || isCoordinator || isOperator || isInstaller;
  // Финансист (finance) сервисом не занимается — если он попал в модуль,
  // ему не показываем действий, только просмотр KPI/доски.

  const canManagePlans = isAdmin || isManager || isCoordinator;
  const canCreateRequest = isAdmin || isManager || isCoordinator || isOperator;
  const canEditRequest = isAdmin || isManager || isCoordinator || isOperator;
  const canAssignRequest = isAdmin || isManager || isCoordinator;
  const canManageCallbacks = isAdmin || isManager || isCoordinator || isOperator;
  const canChangeStatus = isAdmin || isManager || isCoordinator || isOperator || isInstaller;
  const canDeletePlan = isAdmin; // manager/coordinator — без удаления (уровень RLS).
  const canDeleteRequest = isAdmin;
  const canViewServiceReports = isAdmin || isManager;

  // Исполнитель без других ролей — сужаем список в UI.
  const onlyAssignedInUI = isInstaller && !isAdmin && !isManager && !isCoordinator && !isOperator;

  const tabs: ServiceTab[] = [];
  if (isStaff) {
    tabs.push("board", "all");
  }
  if (canManageCallbacks) tabs.push("callbacks");
  if (canManagePlans) tabs.push("plans");
  // Executor: только «Доска» и «Все заявки» (в клиенте — только его).

  return {
    canViewService: isStaff,
    canCreateRequest,
    canEditRequest,
    canAssignRequest,
    canChangeStatus,
    canManageCallbacks,
    canManagePlans,
    canDeletePlan,
    canDeleteRequest,
    canViewServiceReports,
    onlyAssignedInUI,
    tabs,
  };
}
