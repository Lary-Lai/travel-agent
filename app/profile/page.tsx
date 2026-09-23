import { connection } from "next/server";

import { ProfileForm } from "@/components/profile-form";

export const metadata = {
  title: "个人主页",
  description: "编辑昵称与头像、查看账号信息、修改密码。",
};

export default async function ProfilePage() {
  await connection();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <ProfileForm />
    </div>
  );
}
