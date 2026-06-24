import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lock } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
  title?: string;
};

export function PinGateDialog({ open, onOpenChange, onSuccess, title }: Props) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pin) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("verify_access_pin", { _pin: pin });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (!data) { toast.error("Неверный код доступа"); return; }
    setPin("");
    onOpenChange(false);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setPin(""); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Lock className="size-4" />Код доступа к базе обзвона</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {title && <p className="text-sm text-muted-foreground">{title}</p>}
          <div>
            <Label>PIN-код</Label>
            <Input type="password" inputMode="numeric" autoFocus value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!pin || busy} className="bg-gradient-primary">Подтвердить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SetProps = { open: boolean; onOpenChange: (v: boolean) => void };

export function SetPinDialog({ open, onOpenChange }: SetProps) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (pin.length < 4) { toast.error("Минимум 4 символа"); return; }
    if (pin !== pin2) { toast.error("PIN не совпадает"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("set_access_pin", { _pin: pin });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("PIN-код обновлён");
    setPin(""); setPin2("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Установить PIN-код базы</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Код требуется для импорта, экспорта и удаления контактов.</p>
          <div><Label>Новый PIN</Label><Input type="password" value={pin} onChange={(e) => setPin(e.target.value)} /></div>
          <div><Label>Повторите PIN</Label><Input type="password" value={pin2} onChange={(e) => setPin2(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={busy} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
