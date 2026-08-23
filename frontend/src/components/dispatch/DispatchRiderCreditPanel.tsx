'use client';

import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import {
  formatDispatchShortId,
  type DispatchRequest,
} from '@/lib/api/dispatch';
import {
  groupHeldRiderCredit,
  totalHeldRiderCreditCents,
} from '@/lib/dispatch/riderCreditDebt';
import { publicMenuOrigin } from '@/lib/restaurantSubdomain';
import styles from './DispatchRiderCreditPanel.module.css';

function trackingUrlFor(subdomain: string, token: string): string {
  return `${publicMenuOrigin(subdomain)}/rastreo/${token}`;
}

function money(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(cents / 100);
}

export function DispatchRiderCreditPanel({
  requests,
  subdomain,
  busy = false,
  onConfirmCash,
}: {
  requests: DispatchRequest[];
  subdomain: string;
  busy?: boolean;
  onConfirmCash: (request: DispatchRequest) => void;
}) {
  const groups = groupHeldRiderCredit(requests);
  const totalCents = totalHeldRiderCreditCents(groups);
  const showHoldAmounts = groups.length > 1 || groups.some((group) => group.requests.length > 1);

  if (groups.length === 0) return null;

  return (
    <section className={styles.panel} aria-labelledby="rider-credit-title">
      <header className={styles.header}>
        <div className={styles.heading}>
          <PaymentsOutlinedIcon className={styles.headingIcon} aria-hidden />
          <div>
            <h2 id="rider-credit-title">Crédito retenido</h2>
            <p>Riders a los que todavía no les has liberado el efectivo.</p>
          </div>
        </div>
        <p className={styles.total} aria-label={`Deuda acumulada ${money(totalCents)}`}>
          {money(totalCents)}
        </p>
      </header>

      <ul className={styles.groups}>
        {groups.map((group) => (
          <li key={group.key} className={styles.group}>
            <div className={styles.groupHead}>
              <div className={styles.rider}>
                {group.photoUrl ? (
                  <img src={group.photoUrl} alt="" className={styles.photo} />
                ) : (
                  <span className={styles.photoFallback} aria-hidden>
                    {group.riderName.slice(0, 1)}
                  </span>
                )}
                <div>
                  <p className={styles.riderName}>{group.riderName}</p>
                  <p className={styles.riderMeta}>
                    {group.requests.length === 1
                      ? '1 entrega pendiente'
                      : `${group.requests.length} entregas pendientes`}
                  </p>
                </div>
              </div>
              {group.requests.length > 1 ? (
                <p className={styles.groupTotal}>{money(group.totalCents)}</p>
              ) : null}
            </div>

            <ul className={styles.holds}>
              {group.requests.map((request) => {
                const trackingUrl = subdomain
                  ? trackingUrlFor(subdomain, request.tracking_token)
                  : null;
                const shortId = formatDispatchShortId(request.short_id);
                return (
                  <li
                    key={request.id}
                    className={`${styles.hold}${showHoldAmounts ? ` ${styles.holdWithAmount}` : ''}`}
                  >
                    <div className={styles.holdCopy}>
                      <p className={styles.holdId}>{shortId}</p>
                      <p className={styles.holdCustomer}>{request.customer_name}</p>
                    </div>
                    {showHoldAmounts ? (
                      <p className={styles.holdAmount}>
                        {money(request.credit_hold_cents || request.collect_cents)}
                      </p>
                    ) : null}
                    <div className={styles.holdActions}>
                      {trackingUrl ? (
                        <a
                          className={styles.trackLink}
                          href={trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Rastrear envío ${shortId}`}
                        >
                          <OpenInNewOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
                          Rastrear
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className={styles.confirmButton}
                        disabled={busy}
                        onClick={() => onConfirmCash(request)}
                      >
                        <CheckOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                        Liberar crédito
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
