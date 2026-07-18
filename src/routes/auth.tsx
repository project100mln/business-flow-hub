import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Вход — Orbit" }, { name: "description", content: "Вход в систему управления бизнесом Orbit." }] }),
  component: AuthPage,
});

// check_invite() was added by the multitenancy migration and isn't in the
// generated Supabase types yet, so call it through an untyped client handle.
const rpc = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const roleLabels: Record<string, string> = {
  admin: "Собственник",
  manager: "Менеджер",
  operator: "Колл-центр",
  installer: "Монтажник",
  finance: "Финансист",
  coordinator: "Координатор",
};

type Invite = { token: string; companyName: string; role: string; valid: boolean };

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("login");
  const [invite, setInvite] = useState<Invite | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app/dashboard" });
    });
  }, [navigate]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    setTab("signup");
    rpc.rpc("check_invite", { _token: token }).then(({ data }) => {
      const row = (Array.isArray(data) ? data[0] : data) as
        | { company_name: string; role: string; is_valid: boolean }
        | undefined;
      setInvite({
        token,
        companyName: row?.company_name ?? "",
        role: row?.role ?? "",
        valid: !!row?.is_valid,
      });
    });
  }, []);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Добро пожаловать");
    navigate({ to: "/app/dashboard" });
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, ...(invite ? { invite_token: invite.token } : {}) },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Аккаунт создан. Проверьте почту для подтверждения.");
  };

  const onGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (result.error) return toast.error("Ошибка входа через Google");
    if (result.redirected) return;
    navigate({ to: "/app/dashboard" });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="size-8 rounded-lg bg-gradient-primary shadow-glow" />
          <span className="text-lg font-semibold tracking-tight">Orbit</span>
        </Link>

        <div className="rounded-2xl border border-border bg-gradient-surface p-8 shadow-card">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="signup">Регистрация</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4 pt-6">
              <form onSubmit={onLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-l">Email</Label>
                  <Input id="email-l" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw-l">Пароль</Label>
                  <Input id="pw-l" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-primary hover:opacity-90">
                  {loading ? "Входим..." : "Войти"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4 pt-6">
              {invite && (
                invite.valid ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
                    Вас пригласили в компанию <span className="font-semibold">{invite.companyName}</span>
                    {invite.role && (
                      <> — роль «{roleLabels[invite.role] ?? invite.role}»</>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                    Приглашение недействительно или истекло. Зарегистрироваться можно, но без доступа к компании — запросите новую ссылку.
                  </div>
                )
              )}
              <form onSubmit={onSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name-s">Полное имя</Label>
                  <Input id="name-s" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-s">Email</Label>
                  <Input id="email-s" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw-s">Пароль</Label>
                  <Input id="pw-s" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-gradient-primary hover:opacity-90">
                  {loading ? "Создаём..." : "Создать аккаунт"}
                </Button>
                {!invite && (
                  <p className="text-xs text-muted-foreground">
                    Доступ к компании выдаётся по приглашению. Без него аккаунт будет создан, но без компании и роли.
                  </p>
                )}
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> или <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" className="w-full" onClick={onGoogle}>
            <svg viewBox="0 0 24 24" className="size-4 mr-2"><path fill="currentColor" d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.6 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95s2.63-5.95 5.85-5.95c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.65 3.93 14.55 3 12 3 6.99 3 3 6.99 3 12s3.99 9 9 9c5.2 0 8.64-3.65 8.64-8.79 0-.59-.07-1.04-.14-1.51z"/></svg>
            Войти через Google
          </Button>
        </div>
      </div>
    </div>
  );
}
