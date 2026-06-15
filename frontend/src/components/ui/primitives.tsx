import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50",
        variant === "primary" && "bg-[var(--brand)] text-white hover:opacity-90",
        variant === "secondary" && "border border-zinc-300 bg-white hover:bg-zinc-50",
        variant === "ghost" && "hover:bg-zinc-100",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("rounded-xl border border-zinc-200 bg-white p-4 shadow-sm", className)}
    >
      {children}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
      {...props}
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-zinc-700">{children}</label>;
}
