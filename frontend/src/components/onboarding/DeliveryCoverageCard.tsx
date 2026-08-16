'use client';

import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import type { MexyCoverageResponse } from '@/lib/api/types';
import { coverageCardCopy } from '@/lib/deliveryCoverageCopy';

import styles from './DeliveryCoverageCard.module.css';

type DeliveryCoverageCardProps = {
  coverage: MexyCoverageResponse;
};

export function DeliveryCoverageCard({ coverage }: DeliveryCoverageCardProps) {
  const copy = coverageCardCopy(coverage);
  const hasZone = coverage.zone !== null;
  const Icon = hasZone ? LocalShippingOutlinedIcon : PlaceOutlinedIcon;

  return (
    <article className={styles.card} aria-live="polite">
      <span className={styles.iconWrap} aria-hidden>
        <Icon sx={{ fontSize: 20 }} />
      </span>
      <div className={styles.body}>
        <h3 className={styles.title}>{copy.title}</h3>
        <p className={styles.bodyText}>{copy.body}</p>
      </div>
    </article>
  );
}
