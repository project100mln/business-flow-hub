
REVOKE EXECUTE ON FUNCTION public.deals_automation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.installment_payment_paid() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_installment_statuses() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_upcoming_cartridge_tasks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
