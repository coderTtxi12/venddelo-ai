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
  riderApkDropDetailHint,
  riderApkDropDetailHintTouch,
  riderApkDropIdleHint,
  riderApkDropIdleHintTouch,
  riderApkDropRejectHint,
  riderApkEmptyHint,
  riderApkOwnerHint,
  riderApkOwnerHintTouch,
  riderApkReadOnlyHint,
  riderApkUploadProgressLabel,
  riderApkUploadProgressPercent,
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
  const [uploadLoaded, setUploadLoaded] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'starting' | 'uploading' | 'finishing'>(
    'starting',
  );
  const busy = uploading || savingUrl;
  const uploadPercent = riderApkUploadProgressPercent(uploadLoaded, uploadTotal);
  const progressLabel =
    uploadPhase === 'starting'
      ? 'Preparando carga…'
      : uploadPhase === 'finishing'
        ? 'Publicando el APK…'
        : riderApkUploadProgressLabel(uploadLoaded, uploadTotal);

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
    setUploadPhase('starting');
    setUploadLoaded(0);
    setUploadTotal(file.size);
    setError(null);
    setStatus(null);
    try {
      const apk = await uploadMyRiderApk(accessToken, file, (loaded, total) => {
        setUploadPhase('uploading');
        setUploadLoaded(loaded);
        setUploadTotal(total > 0 ? total : file.size);
        if (total > 0 && loaded >= total) setUploadPhase('finishing');
      });
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
        {canManageRiderApp ? (
          <>
            <span className={styles.onlyDesktop}>{riderApkOwnerHint()}</span>
            <span className={styles.onlyTouch}>{riderApkOwnerHintTouch()}</span>
          </>
        ) : (
          riderApkReadOnlyHint()
        )}
      </p>
      {loading ? (
        <p className={pageStyles.loading} role="status">
          Cargando APK…
        </p>
      ) : (
        <>
          {url ? (
            <div className={styles.published}>
              <span className={styles.publishedIcon} aria-hidden>
                <InsertDriveFileOutlinedIcon sx={{ fontSize: 22 }} />
              </span>
              <div className={styles.publishedBody}>
                <p className={styles.publishedName}>{fileName || 'APK publicado'}</p>
                <p className={styles.publishedMeta}>Listo para que los riders lo descarguen.</p>
                <a
                  className={styles.publishedLink}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir enlace
                  <OpenInNewOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
                </a>
              </div>
            </div>
          ) : (
            <p className={styles.empty}>{riderApkEmptyHint()}</p>
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
              <input
                id={fileInputId}
                ref={fileInputRef}
                type="file"
                accept=".apk,application/vnd.android.package-archive"
                className={pageStyles.hiddenInput}
                disabled={busy}
                aria-describedby={`${hintId} ${dropHintId}`}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  acceptFile(file && pickDroppedApkFile([file]));
                  event.target.value = '';
                }}
              />
              <label
                htmlFor={fileInputId}
                className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : ''} ${
                  uploading ? styles.dropzoneBusy : ''
                }`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <span className={styles.dropIcon} aria-hidden>
                  <CloudUploadOutlinedIcon sx={{ fontSize: 28 }} />
                </span>
                <span className={styles.dropTitle}>
                  {uploading ? (
                    'Subiendo APK…'
                  ) : dragActive ? (
                    riderApkDropActiveHint()
                  ) : (
                    <>
                      <span className={styles.onlyDesktop}>{riderApkDropIdleHint()}</span>
                      <span className={styles.onlyTouch}>{riderApkDropIdleHintTouch()}</span>
                    </>
                  )}
                </span>
                <span id={dropHintId} className={styles.dropHint}>
                  {uploading ? (
                    'Espera a que termine la carga. No cierres esta página.'
                  ) : (
                    <>
                      <span className={styles.onlyDesktop}>{riderApkDropDetailHint()}</span>
                      <span className={styles.onlyTouch}>{riderApkDropDetailHintTouch()}</span>
                    </>
                  )}
                </span>
              </label>
              <div className={styles.urlBlock}>
                <p className={styles.urlDivider}>o pega una URL</p>
                <label className={pageStyles.label} htmlFor={urlInputId}>
                  URL de descarga
                </label>
                <div className={styles.urlRow}>
                  <input
                    id={urlInputId}
                    className={`${pageStyles.input} ${styles.urlInput}`}
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
                </div>
              </div>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}
