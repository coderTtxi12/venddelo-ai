import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { getRestaurant } from "@/lib/api/restaurants";
import { getAccessToken } from "@/lib/auth/server";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  const token = await getAccessToken();
  let restaurantName = "Mi restaurante";
  if (token) {
    try {
      const r = await getRestaurant(token, restaurantId);
      restaurantName = r.name;
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] lg:grid lg:grid-cols-[260px_1fr]">
      <SidebarNav restaurantId={restaurantId} restaurantName={restaurantName} />
      <main className="min-h-screen px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
