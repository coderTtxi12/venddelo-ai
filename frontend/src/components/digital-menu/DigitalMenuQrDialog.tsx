'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import QrCode2OutlinedIcon from '@mui/icons-material/QrCode2Outlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SmartphoneOutlinedIcon from '@mui/icons-material/SmartphoneOutlined';
import {
  DEFAULT_MENU_QR_CONFIG,
  MENU_QR_EXPORT_RENDER_SCALE,
  MENU_QR_PRESETS,
  MENU_QR_PREVIEW_RENDER_SCALE,
  getMenuQrRenderPixelSize,
  getMenuQrScanSafety,
  mergeMenuQrPreset,
  type MenuQrConfig,
  type MenuQrCornerStyle,
  type MenuQrDotStyle,
} from '@/lib/digital-menu/qr/menuQrStudio';
import {
  createMenuQrRenderer,
  downloadBlob,
  downloadMenuQrPdf,
  printMenuQr,
  type MenuQrRenderer,
} from '@/lib/digital-menu/qr/menuQrRenderer';
import styles from './DigitalMenuQrDialog.module.css';

type DigitalMenuQrDialogProps = {
  open: boolean;
  onClose: () => void;
  menuUrl: string;
  restaurantName: string;
};

const DOT_STYLE_OPTIONS: { value: MenuQrDotStyle; label: string }[] = [
  { value: 'square', label: 'Cuadrado' },
  { value: 'rounded', label: 'Redondeado' },
  { value: 'dots', label: 'Puntos' },
  { value: 'extra-rounded', label: 'Extra redondeado' },
  { value: 'classy', label: 'Clásico' },
  { value: 'classy-rounded', label: 'Clásico redondeado' },
];

const CORNER_STYLE_OPTIONS: { value: MenuQrCornerStyle; label: string }[] = [
  { value: 'square', label: 'Cuadrado' },
  { value: 'dot', label: 'Punto' },
  { value: 'extra-rounded', label: 'Redondeado' },
];

export function DigitalMenuQrDialog({
  open,
  onClose,
  menuUrl,
  restaurantName,
}: DigitalMenuQrDialogProps) {
  const titleId = useId();
  const previewRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MenuQrRenderer | null>(null);
  const [config, setConfig] = useState<MenuQrConfig>(DEFAULT_MENU_QR_CONFIG);
  const [activePresetId, setActivePresetId] = useState<string | null>('rounded');
  const [presetQuery, setPresetQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const scanSafety = useMemo(() => getMenuQrScanSafety(config), [config]);
  const exportPixelSize = useMemo(
    () => getMenuQrRenderPixelSize(config, MENU_QR_EXPORT_RENDER_SCALE),
    [config],
  );
  const previewPixelSize = useMemo(
    () => getMenuQrRenderPixelSize(config, MENU_QR_PREVIEW_RENDER_SCALE),
    [config],
  );

  const filteredPresets = useMemo(() => {
    const query = presetQuery.trim().toLowerCase();
    if (!query) return MENU_QR_PRESETS;
    return MENU_QR_PRESETS.filter((preset) => {
      const haystack = `${preset.label} ${preset.theme} ${preset.id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [presetQuery]);

  const fileBaseName = useMemo(
    () =>
      `menu-qr-${restaurantName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'restaurante'}`,
    [restaurantName],
  );

  const patchConfig = useCallback((patch: Partial<MenuQrConfig>) => {
    setActivePresetId(null);
    setConfig((current) => ({ ...current, ...patch }));
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    setConfig((current) => mergeMenuQrPreset(presetId, current) ?? current);
    setActivePresetId(presetId);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const render = async () => {
      setLoading(true);
      setRenderError(null);

      try {
        if (!rendererRef.current) {
          rendererRef.current = await createMenuQrRenderer(menuUrl, config);
        } else {
          rendererRef.current.update(menuUrl, config);
        }

        if (cancelled || !previewRef.current) return;
        rendererRef.current.appendTo(previewRef.current);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setRenderError(
            'No se pudo generar el QR. Ejecuta npm install en frontend e intenta de nuevo.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [open, menuUrl, config]);

  useEffect(() => {
    if (!open) {
      rendererRef.current = null;
      setConfig(DEFAULT_MENU_QR_CONFIG);
      setActivePresetId('rounded');
      setPresetQuery('');
      setRenderError(null);
    }
  }, [open]);

  const getExportBlob = useCallback(async (extension: 'png' | 'jpeg') => {
    if (!rendererRef.current) {
      rendererRef.current = await createMenuQrRenderer(menuUrl, config);
      if (previewRef.current) rendererRef.current.appendTo(previewRef.current);
    } else {
      rendererRef.current.update(menuUrl, config);
    }
    return rendererRef.current.getRawData(extension);
  }, [config, menuUrl]);

  const handleDownloadPng = useCallback(async () => {
    setExporting('png');
    try {
      const blob = await getExportBlob('png');
      downloadBlob(blob, `${fileBaseName}.png`);
    } catch (error) {
      console.error(error);
    } finally {
      setExporting(null);
    }
  }, [fileBaseName, getExportBlob]);

  const handleDownloadJpg = useCallback(async () => {
    setExporting('jpg');
    try {
      const blob = await getExportBlob('jpeg');
      downloadBlob(blob, `${fileBaseName}.jpg`);
    } catch (error) {
      console.error(error);
    } finally {
      setExporting(null);
    }
  }, [fileBaseName, getExportBlob]);

  const handleDownloadPdf = useCallback(async () => {
    setExporting('pdf');
    try {
      const blob = await getExportBlob('png');
      await downloadMenuQrPdf(blob, `${fileBaseName}.pdf`, restaurantName, menuUrl);
    } catch (error) {
      console.error(error);
    } finally {
      setExporting(null);
    }
  }, [fileBaseName, getExportBlob, menuUrl, restaurantName]);

  const handlePrint = useCallback(async () => {
    setExporting('print');
    try {
      const blob = await getExportBlob('png');
      await printMenuQr(blob, restaurantName, menuUrl);
    } catch (error) {
      console.error(error);
    } finally {
      setExporting(null);
    }
  }, [getExportBlob, menuUrl, restaurantName]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerTitleRow}>
            <QrCode2OutlinedIcon className={styles.headerIcon} aria-hidden />
            <div>
              <h2 id={titleId} className={styles.title}>
                QR del menú en vivo
              </h2>
              <p className={styles.subtitle}>Personaliza y descarga el código para tu local</p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} aria-label="Cerrar" onClick={onClose}>
            <CloseIcon sx={{ fontSize: 20 }} />
          </button>
        </header>

        <div className={styles.testBanner} role="note">
          <SmartphoneOutlinedIcon className={styles.testBannerIcon} aria-hidden />
          <p className={styles.testBannerText}>
            <strong>Antes de imprimir o pegar el QR,</strong> escanéalo con tu celular y confirma
            que abre el menú correcto.
          </p>
        </div>

        <div className={styles.body}>
          <section className={styles.previewPanel} aria-label="Vista previa del QR">
            <div
              className={`${styles.previewSurface} ${
                config.transparentBackground ? styles.previewSurfaceChecker : ''
              }`}
            >
              <div ref={previewRef} className={styles.previewMount} aria-live="polite" />
              {loading ? <p className={styles.previewLoading}>Generando QR…</p> : null}
              {renderError ? <p className={styles.previewError}>{renderError}</p> : null}
            </div>

            <p className={styles.hdMeta}>
              Vista HD {previewPixelSize}×{previewPixelSize}px · exportación{' '}
              {exportPixelSize}×{exportPixelSize}px
            </p>

            <p className={styles.menuUrl} title={menuUrl}>
              {menuUrl}
            </p>

            <div
              className={`${styles.scanSafety} ${styles[`scanSafety_${scanSafety.level}`]}`}
              role="status"
            >
              <InfoOutlinedIcon className={styles.scanSafetyIcon} aria-hidden />
              <span>{scanSafety.message}</span>
            </div>
          </section>

          <section className={styles.controlsPanel} aria-label="Personalización del QR">
            <div className={styles.controlGroup}>
              <div className={styles.controlLabelRow}>
                <span className={styles.controlLabel}>
                  Temas QR ({filteredPresets.length})
                </span>
              </div>
              <div className={styles.presetSearchRow}>
                <SearchOutlinedIcon className={styles.presetSearchIcon} aria-hidden />
                <input
                  type="search"
                  className={styles.presetSearchInput}
                  value={presetQuery}
                  onChange={(e) => setPresetQuery(e.target.value)}
                  placeholder="Buscar por cocina, estilo o festividad…"
                  aria-label="Buscar temas QR"
                />
              </div>
              <div className={styles.presetGrid}>
                {filteredPresets.length === 0 ? (
                  <p className={styles.presetEmpty}>No hay temas que coincidan.</p>
                ) : (
                  filteredPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`${styles.presetChip} ${
                      activePresetId === preset.id ? styles.presetChipActive : ''
                    }`}
                    title={preset.theme}
                    onClick={() => applyPreset(preset.id)}
                  >
                    <span
                      className={styles.presetSwatch}
                      style={{
                        background: preset.config.transparentBackground
                          ? 'linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)'
                          : (preset.config.backgroundColor ?? '#ffffff'),
                        backgroundSize: preset.config.transparentBackground ? '8px 8px' : undefined,
                        backgroundPosition: preset.config.transparentBackground
                          ? '0 0, 4px 4px'
                          : undefined,
                      }}
                      aria-hidden
                    >
                      <span
                        className={styles.presetSwatchDot}
                        style={{ background: preset.config.dotColor ?? '#0f172a' }}
                      />
                    </span>
                    {preset.label}
                  </button>
                  ))
                )}
              </div>
            </div>

            <div className={styles.controlGrid}>
              <label className={styles.field}>
                <span>Color del QR</span>
                <input
                  type="color"
                  value={config.dotColor}
                  onChange={(e) =>
                    patchConfig({
                      dotColor: e.target.value,
                      cornerColor: e.target.value,
                      cornerDotColor: e.target.value,
                    })
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Fondo</span>
                <input
                  type="color"
                  value={config.backgroundColor}
                  disabled={config.transparentBackground}
                  onChange={(e) => patchConfig({ backgroundColor: e.target.value })}
                />
              </label>
            </div>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={config.transparentBackground}
                onChange={(e) => patchConfig({ transparentBackground: e.target.checked })}
              />
              <span>Fondo transparente (PNG)</span>
            </label>

            <div className={styles.controlGrid}>
              <label className={styles.field}>
                <span>Estilo módulos</span>
                <select
                  value={config.dotStyle}
                  onChange={(e) => patchConfig({ dotStyle: e.target.value as MenuQrDotStyle })}
                >
                  {DOT_STYLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Esquinas</span>
                <select
                  value={config.cornerStyle}
                  onChange={(e) =>
                    patchConfig({ cornerStyle: e.target.value as MenuQrCornerStyle })
                  }
                >
                  {CORNER_STYLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className={styles.field}>
              <span>Margen seguro ({config.margin}px)</span>
              <input
                type="range"
                min={8}
                max={32}
                step={2}
                value={config.margin}
                onChange={(e) => patchConfig({ margin: Number(e.target.value) })}
              />
            </label>

            <label className={styles.field}>
              <span>Tamaño vista ({config.size}px)</span>
              <input
                type="range"
                min={260}
                max={400}
                step={10}
                value={config.size}
                onChange={(e) => patchConfig({ size: Number(e.target.value) })}
              />
            </label>
          </section>
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() => void handleDownloadPng()}
            disabled={Boolean(exporting) || Boolean(renderError)}
          >
            <DownloadOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            {exporting === 'png' ? 'Descargando…' : 'PNG'}
          </button>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() => void handleDownloadJpg()}
            disabled={Boolean(exporting) || Boolean(renderError)}
          >
            <DownloadOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            {exporting === 'jpg' ? 'Descargando…' : 'JPG'}
          </button>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={() => void handleDownloadPdf()}
            disabled={Boolean(exporting) || Boolean(renderError)}
          >
            <DownloadOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            {exporting === 'pdf' ? 'Descargando…' : 'PDF'}
          </button>
          <button
            type="button"
            className={`${styles.exportBtn} ${styles.exportBtnPrimary}`}
            onClick={() => void handlePrint()}
            disabled={Boolean(exporting) || Boolean(renderError)}
          >
            <PrintOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            {exporting === 'print' ? 'Preparando…' : 'Imprimir'}
          </button>
        </footer>
      </div>
    </div>
  );
}
