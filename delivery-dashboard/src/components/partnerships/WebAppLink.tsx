'use client';

import { useEffect, useId, useState } from 'react';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import {
  restaurantPublicMenuLabel,
  restaurantPublicMenuUrl,
} from '@/lib/menu/publicMenuUrl';
import styles from './WebAppLink.module.css';

type WebAppLinkProps = {
  subdomain: string;
  restaurantName: string;
};

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(input);
      return ok;
    } catch {
      return false;
    }
  }
}

export function WebAppLink({ subdomain, restaurantName }: WebAppLinkProps) {
  const statusId = useId();
  const url = restaurantPublicMenuUrl(subdomain);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 3000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!url) return null;

  const menuUrl = url;
  const host = restaurantPublicMenuLabel(menuUrl);

  async function handleCopy() {
    const ok = await copyToClipboard(menuUrl);
    if (ok) setCopied(true);
  }

  return (
    <div className={styles.row}>
      <span className={styles.icon} aria-hidden>
        <LanguageOutlinedIcon sx={{ fontSize: 18 }} />
      </span>
      <div className={styles.body}>
        <p className={styles.label}>Web app</p>
        <p className={styles.url}>{host}</p>
        <div className={styles.actions}>
          <a
            href={menuUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.action}
            aria-label={`Abrir web app de ${restaurantName} (se abre en una pestaña nueva)`}
          >
            <OpenInNewOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            Abrir
          </a>
          <button
            type="button"
            className={styles.action}
            aria-describedby={statusId}
            aria-label={copied ? 'Enlace copiado' : `Copiar enlace de ${restaurantName}`}
            onClick={() => void handleCopy()}
          >
            <ContentCopyOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <span id={statusId} className={styles.status} role="status" aria-atomic="true">
          {copied ? 'Enlace copiado al portapapeles' : ''}
        </span>
      </div>
    </div>
  );
}
