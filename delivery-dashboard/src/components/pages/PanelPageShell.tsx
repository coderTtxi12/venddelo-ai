import type { ReactNode } from 'react';

type PanelPageShellProps = {
  title: string;
  subtitle: string;
  styles: {
    page: string;
    header: string;
    title: string;
    subtitle: string;
    empty?: string;
    emptyTitle?: string;
    emptySubtitle?: string;
  };
  action?: ReactNode;
  children?: ReactNode;
};

export function PanelPageShell({
  title,
  subtitle,
  styles: s,
  action,
  children,
}: PanelPageShellProps) {
  return (
    <div className={s.page}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>{title}</h1>
          <p className={s.subtitle}>{subtitle}</p>
        </div>
        {action}
      </div>
      {children ?? (
        <div className={s.empty}>
          <p className={s.emptyTitle}>Próximamente</p>
          {s.emptySubtitle && (
            <p className={s.emptySubtitle}>
              Esta sección está lista para conectar con la lógica de delivery.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
