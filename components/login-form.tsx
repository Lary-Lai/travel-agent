"use client";

import { AlertCircle, Compass, Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { useT } from "@/components/locale-provider";
import { toast } from "sonner";

import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiClientError } from "@/lib/api";

const DEMO = { email: "demo@travel-agent.dev", password: "Demo1234" };

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useSession();
  const t = useT();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirect = params.get("redirect") ?? "/";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { user } = await api.login(email, password);
      await refresh();
      toast.success(t("auth.welcomeBack", { name: user.name }));
      router.push(redirect);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof ApiClientError ? caught.message : t("auth.loginFailed");
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6 text-center">
        <span className="bg-primary text-primary-foreground mx-auto mb-4 flex size-11 items-center justify-center rounded-xl">
          <Compass className="size-5" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">{t("auth.loginTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("auth.loginSubtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border p-6">
        {error ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email">{t("auth.email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("auth.password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("auth.passwordInputPlaceholder")}
          />
        </div>

        <Button type="submit" className="w-full gap-2" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          {submitting ? t("auth.signingIn") : t("auth.loginSubmit")}
        </Button>

        {/* Demo credentials */}
        <div className="bg-muted/50 rounded-lg p-3 text-xs">
          <p className="text-muted-foreground mb-2">
            {t("auth.demoAccount")}<code className="text-foreground">{DEMO.email}</code> /{" "}
            <code className="text-foreground">{DEMO.password}</code>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              setEmail(DEMO.email);
              setPassword(DEMO.password);
            }}
          >
            {t("auth.fillDemo")}
          </Button>
        </div>

        <p className="text-muted-foreground text-center text-sm">
          {t("auth.noAccount")}
          <Link href="/register" className="text-primary ml-1 font-medium hover:underline">
            {t("auth.goRegister")}
          </Link>
        </p>
      </form>
    </div>
  );
}
