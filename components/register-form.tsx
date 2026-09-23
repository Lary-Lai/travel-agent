"use client";

import { AlertCircle, Compass, Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiClientError } from "@/lib/api";

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useSession();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirect = params.get("redirect") ?? "/";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("密码至少需要 8 位字符");
      return;
    }

    setSubmitting(true);
    try {
      const { user } = await api.register(name, email, password);
      await refresh();
      toast.success(`注册成功，欢迎 ${user.name}`);
      router.push(redirect);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof ApiClientError ? caught.message : "注册失败，请稍后重试";
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
        <h1 className="text-xl font-semibold tracking-tight">创建你的账号</h1>
        <p className="text-muted-foreground mt-1 text-sm">注册后即可使用收藏、预订与 AI 助手</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border p-6">
        {error ? (
          <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="name">昵称</Label>
          <Input
            id="name"
            required
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="怎么称呼你？"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
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
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 位字符"
          />
        </div>

        <Button type="submit" className="w-full gap-2" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          {submitting ? "注册中…" : "注册并登录"}
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          已经有账号了？
          <Link href="/login" className="text-primary ml-1 font-medium hover:underline">
            去登录
          </Link>
        </p>
      </form>
    </div>
  );
}
