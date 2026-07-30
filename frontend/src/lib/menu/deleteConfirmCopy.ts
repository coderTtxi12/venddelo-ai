export type DeleteConfirmKind = 'product' | 'category';

export type DeleteConfirmCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
};

type DeleteConfirmArgs =
  | { kind: 'product'; name: string }
  | { kind: 'category'; name: string; linkedProductCount: number };

export function buildDeleteConfirmCopy(args: DeleteConfirmArgs): DeleteConfirmCopy {
  const title = `¿Eliminar «${args.name}»?`;
  const irreversible =
    args.kind === 'product'
      ? 'Se quitará del catálogo y no se puede deshacer.'
      : 'Se eliminará del catálogo y no se puede deshacer.';

  let description = irreversible;
  if (args.kind === 'category') {
    const n = args.linkedProductCount;
    if (n > 0) {
      const noun = n === 1 ? 'producto vinculado' : 'productos vinculados';
      description = `${irreversible} Esta categoría tiene ${n} ${noun}. Se eliminará de todas formas.`;
    }
  }

  return {
    title,
    description,
    confirmLabel: 'Eliminar',
    cancelLabel: 'Cancelar',
  };
}
