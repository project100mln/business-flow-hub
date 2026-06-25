
REVOKE EXECUTE ON FUNCTION public.list_operators() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_rename_operator(uuid,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_remove_operator(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_add_operator(text,text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_assign_contacts(uuid[],uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.list_operators() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rename_operator(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_operator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_operator(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_contacts(uuid[],uuid) TO authenticated;
