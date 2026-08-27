'use client';

import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import { useAuth } from '@/hooks/useAuth';
import { useDeliveryProviderAccess } from '@/contexts/DeliveryProviderAccessContext';
import { ApiError } from '@/lib/api/types';
import {
  getMyRiderApk,
  patchMyRiderApkUrl,
  uploadMyRiderApk,
} from '@/lib/api/deliveryProviders';
import {
  pickDroppedApkFile,
  riderApkDropActiveHint,
  riderApkDropIdleHint,
  riderApkDropRejectHint,
  riderApkEmptyHint,
  riderApkOwnerHint,
  riderApkReadOnlyHint,
} from '@/lib/settings/riderApkCopy';
import pageStyles from '@/components/pages/SettingsPage.module.css';
import styles from './RiderApkPanel.module.css';

export function RiderApkPanel() {
  const { accessToken } = useAuth();
  const { canManageRiderApp } = useDeliveryProviderAccess();
  const fileInputId = useId();
  const urlInputId = useId();
  const hintId = useId();
  const errorId = useId();
  const dropHintId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const busy = uploading || savingUrl;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken) return;
      setLoading(true);
      setError(null);
      try {
        const apk = await getMyRiderApk(accessToken);
        if (cancelled) return;
        setUrl(apk.url);
        setFileName(apk.file_name);
        setUrlDraft(apk.url ?? '');
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('No se pudo cargar el APK del rider.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleUpload(file: File) {
    if (!accessToken || !canManageRiderApp) return;
    setUploading(true);
    setError(null);
    setStatus(null);
    try {
      const apk = await uploadMyRiderApk(accessToken, file);
      setUrl(apk.url);
      setFileName(apk.file_name);
      setUrlDraft(apk.url ?? '');
      setStatus('APK listo para descargar.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo subir el APK.');
    } finally {
      setUploading(false);
    }
  }

  function acceptFile(file: File | null) {
    if (!file) {
      setStatus(null);
      setError(riderApkDropRejectHint());
      return;
    }
    void handleUpload(file);
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    dragDepth.current += 1;
    setDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragActive(false);
    if (busy) return;
    acceptFile(pickDroppedApkFile(event.dataTransfer.files));
  }

  async function handleSaveUrl() {
    if (!accessToken || !canManageRiderApp) return;
    setSavingUrl(true);
    setError(null);
    setStatus(null);
    try {
      const next = urlDraft.trim() === '' ? null : urlDraft.trim();
      const apk = await patchMyRiderApkUrl(accessToken, next);
      setUrl(apk.url);
      setFileName(apk.file_name);
      setUrlDraft(apk.url ?? '');
      setStatus(apk.url ? 'URL guardada.' : 'Se quitó la URL del APK.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la URL.');
    } finally {
      setSavingUrl(false);
    }
  }

  return (
    <section className={pageStyles.panel} aria-labelledby="settings-rider-apk">
      <h2 id="settings-rider-apk" className={pageStyles.panelTitle}>
        App del rider
      </h2>
      <p id={hintId} className={pageStyles.panelHint}>
        {canManageRiderApp ? riderApkOwnerHint() : riderApkReadOnlyHint()}
      </p>
      {loading ? (
        <p className={pageStyles.loading} role="status">
          Cargando APK…
        </p>
      ) : (
        <>
          {url ? (
            <div className={pageStyles.readonlyField}>
              <span className={pageStyles.readonlyLabel}>Publicado</span>
              <span className={`${pageStyles.readonlyValue} ${styles.fileRow}`}>
                <InsertDriveFileOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                <span>
                  {fileName ? <strong>{fileName}</strong> : 'APK publicado'}
                  {' · '}
                  <a href={url} target="_blank" rel="noreferrer">
                    Abrir enlace
                  </a>
                </span>
              </span>
            </div>
          ) : (
            <p className={pageStyles.empty}>{riderApkEmptyHint()}</p>
          )}
          {error ? (
            <div id={errorId} className={pageStyles.errorBanner} role="alert">
              {error}
            </div>
          ) : null}
          {status ? (
            <div className={pageStyles.successBanner} role="status">
              {status}
            </div>
          ) : null}
          {canManageRiderApp ? (
            <form
              className={styles.form}
              aria-busy={busy}
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveUrl();
              }}
            >
              <label className={pageStyles.label} htmlFor={fileInputId}>
                Archivo APK
              </label>
              <p className={styles.fieldHint}>Máximo 80 MB. Solo archivos .apk.</p>
              <div className={styles.fileActions}>
                <button
                  type="button"
                  className={`${pageStyles.secondaryBtn} ${styles.uploadBtn}`}
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <CloudUploadOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
                  {uploading ? 'Subiendo…' : 'Subir APK'}
                </button>
                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  className={pageStyles.hiddenInput}
                  aria-describedby={hintId}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleUpload(file);
                    event.target.value = '';
                  }}
                />
              </div>
              <label className={pageStyles.label} htmlFor={urlInputId}>
                URL de descarga
              </label>
              <input
                id={urlInputId}
                className={pageStyles.input}
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://"
                value={urlDraft}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : hintId}
                onChange={(event) => setUrlDraft(event.target.value)}
              />
              <button
                type="submit"
                className={`${pageStyles.primaryBtn} ${styles.saveBtn}`}
                disabled={busy}
              >
                {savingUrl ? 'Guardando…' : 'Guardar URL'}
              </button>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}
