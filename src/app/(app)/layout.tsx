import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { hasAccess } from "@/lib/auth";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!(await hasAccess())) redirect("/acceso");
  await getStore().ensureReady();
  return <Shell>{children}</Shell>;
}
