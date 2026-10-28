'use client';

import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import PointOfSaleOutlinedIcon from '@mui/icons-material/PointOfSaleOutlined';
import {
  formatDispatchShortId,
  type DispatchRequest,
} from '@/lib/api/dispatch';
import { groupHeldTerminals } from '@/lib/dispatch/riderTerminalHold';
import { publicMenuOrigin } from '@/lib/restaurantSubdomain';
import styles from './DispatchRiderCreditPanel.module.css';

function trackingUrlFor(subdomain: string, token: string): string {
  return `${publicMenuOrigin(subdomain)}/rastreo/${token}`;
}

export function DispatchTerminalHoldPanel({
  requests,
  subdomain,
  busy = false,
  onConfirmReturn,
}: {
  requests: DispatchRequest[];
  subdomain: string;
  busy?: boolean;
  onConfirmReturn: (request: DispatchRequest) => void;
}) {
  const groups = groupHeldTerminals(requests);

  if (groups.length === 0) return null;

  return (
    <section className={styles.panel} aria-labelledby="terminal-hold-title">
      <header className={styles.header}>
        <div className={styles.heading}>
          <PointOfSaleOutlinedIcon className={styles.headingIcon} aria-hidden />
          <div>
            <h2 id="terminal-hold-title">Terminal retenida</h2>
            <p>Riders que todavía tienen tu terminal.</p>
          </div>
        </div>
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
                      ? '1 terminal pendiente'
                      : `${group.requests.length} terminales pendientes`}
                  </p>
                </div>
              </div>
            </div>

            <ul className={styles.holds}>
              {group.requests.map((request) => {
                const trackingUrl = subdomain
                  ? trackingUrlFor(subdomain, request.tracking_token)
                  : null;
                const shortId = formatDispatchShortId(request.short_id);
                return (
                  <li key={request.id} className={styles.hold}>
                    <div className={styles.holdCopy}>
                      <p className={styles.holdId}>{shortId}</p>
                      <p className={styles.holdCustomer}>{request.customer_name}</p>
                    </div>
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
                        onClick={() => onConfirmReturn(request)}
                      >
                        <CheckOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                        Liberar terminal
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
