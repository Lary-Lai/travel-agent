import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { RegisterForm } from "@/components/register-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";

export const metadata = {
  title: "注册",
  description: "创建账号，开始使用收藏、预订与 AI 旅行助手。",
};

export default async function RegisterPage() {
  await connection();

  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <Suspense fallback={<Skeleton className="mx-auto h-96 w-full max-w-md rounded-2xl" />}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
