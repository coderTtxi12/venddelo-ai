import Link from "next/link";
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
  let restaurantName = "Dashboard";
  if (token) {
    try {
      const r = await getRestaurant(token, restaurantId);
      restaurantName = r.name;
    } catch {
      // ignore
    }
  }

  const base = `/dashboard/${restaurantId}`;
  const links = [
    { href: `${base}/menu`, label: "Menú" },
    { href: `${base}/promotions`, label: "Promociones" },
    { href: `${base}/orders`, label: "Pedidos" },
    { href: `${base}/settings`, label: "Publicar" },
  ];

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-zinc-200 bg-white p-4 md:w-56 md:border-b-0 md:border-r">
        <p className="mb-4 text-sm font-semibold text-zinc-500">Vendelo AI</p>
        <h2 className="mb-6 font-bold">{restaurantName}</h2>
        <nav className="flex gap-3 overflow-x-auto md:flex-col md:gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm hover:bg-zinc-100"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
