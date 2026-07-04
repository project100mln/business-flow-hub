
DROP POLICY IF EXISTS profiles_read_all_auth ON public.profiles;

CREATE POLICY profiles_read_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY profiles_read_staff ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'operator')
    OR public.has_role(auth.uid(), 'coordinator')
  );
