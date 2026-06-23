import styles from './ProductImagePlaceholder.module.css';

export function productNameInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '·';
  return Array.from(trimmed)[0]!.toLocaleUpperCase();
}

type ProductImagePlaceholderVariant = 'thumb' | 'compact' | 'hero';

type ProductImagePlaceholderProps = {
  name: string;
  variant?: ProductImagePlaceholderVariant;
  className?: string;
};

export function ProductImagePlaceholder({
  name,
  variant = 'thumb',
  className,
}: ProductImagePlaceholderProps) {
  const variantClass =
    variant === 'hero' ? styles.hero : variant === 'compact' ? styles.compact : styles.thumb;

  const content = (
    <div className={[styles.root, variantClass].join(' ')} aria-hidden>
      <span className={styles.initial}>{productNameInitial(name)}</span>
    </div>
  );

  if (!className) return content;

  return <div className={className}>{content}</div>;
}
