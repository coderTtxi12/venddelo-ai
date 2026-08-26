'use client';

import type { KitchenTicketDocument } from '@/lib/print/ticketDocument';
import styles from './KitchenTicketPreview.module.css';

export function KitchenTicketPreview({
  document: doc,
}: {
  document: KitchenTicketDocument;
}) {
  return (
    <div
      className={styles.stage}
      data-width={doc.paperWidthMm}
      aria-label="Vista previa del ticket"
    >
      <div className={styles.paper} style={{ width: `${doc.paperWidthMm}mm` }}>
        <div className={styles.perforation} aria-hidden />
        {doc.logoUrl ? (
          <img className={styles.logo} src={doc.logoUrl} alt={`Logo de ${doc.brandName}`} />
        ) : null}
        {doc.lines.map((line, index) => {
          const key = `${line.kind}-${index}`;
          switch (line.kind) {
            case 'brand':
              return (
                <p key={key} className={styles.brand}>
                  {line.text}
                </p>
              );
            case 'muted':
              return (
                <p key={key} className={styles.muted}>
                  {line.text}
                </p>
              );
            case 'rule':
              return <hr key={key} className={styles.rule} />;
            case 'kv':
              return (
                <p key={key} className={styles.row}>
                  <span>{line.label}</span>
                  <span>{line.value}</span>
                </p>
              );
            case 'title':
              return (
                <p key={key} className={styles.title}>
                  {line.text}
                </p>
              );
            case 'item':
              return (
                <p key={key} className={styles.row}>
                  <span>
                    {line.qty}× {line.name}
                  </span>
                  <span>{line.price}</span>
                </p>
              );
            case 'option':
              return (
                <p key={key} className={styles.option}>
                  {line.text}
                </p>
              );
            case 'total':
              return (
                <p key={key} className={`${styles.row} ${line.strong ? styles.strong : ''}`}>
                  <span>{line.label}</span>
                  <span>{line.value}</span>
                </p>
              );
            case 'center':
              return (
                <p key={key} className={styles.center}>
                  {line.text}
                </p>
              );
          }
        })}
        <div className={styles.cut} aria-hidden />
      </div>
    </div>
  );
}
