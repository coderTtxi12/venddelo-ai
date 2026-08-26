'use client';

import { useEffect, useState } from 'react';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { TicketPrinterSettings } from '@/components/settings/TicketPrinterSettings';
import { useAuth } from '@/hooks/useAuth';
import { useRestaurantAccess } from '@/contexts/RestaurantAccessContext';
import { getRestaurant, updateRestaurant } from '@/lib/api/restaurants';
import type { Restaurant } from '@/lib/api/types';
import { ApiError } from '@/lib/api/types';
import {
  EMPTY_KITCHEN_PRINTER,
  defaultPrinterDisplayName,
  hasDefaultKitchenPrinter,
  primeKitchenPrinterConnections,
  type KitchenPrinterPreference,
} from '@/lib/print/kitchenPrinterDevice';
import { normalizeTicketPrintSettings, type TicketPrintSettings } from '@/lib/print/ticketSettings';
import { storagePublicUrl } from '@/lib/storage/publicUrl';
import styles from './PrinterPage.module.css';

export default function PrinterPage() {
  const { accessToken, loading: authLoading } = useAuth();
  const { selectedRestaurantId, loading: accessLoading } = useRestaurantAccess();

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [ticketSettings, setTicketSettings] = useState<TicketPrintSettings>(() =>
    normalizeTicketPrintSettings(null),
  );
  const [defaultPrinter, setDefaultPrinter] =
    useState<KitchenPrinterPreference>(EMPTY_KITCHEN_PRINTER);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (authLoading || accessLoading) return;
      if (!accessToken) {
        setLoadError('No hay sesión activa. Inicia sesión de nuevo.');
        setLoading(false);
        return;
      }
      if (!selectedRestaurantId) {
        setLoadError(
          'No tienes ningún restaurante asociado. Completa el registro inicial para continuar.',
        );
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const restaurantData = await getRestaurant(accessToken, selectedRestaurantId);
        if (cancelled) return;
        setRestaurantId(restaurantData.id);
        setRestaurant(restaurantData);
        setTicketSettings(normalizeTicketPrintSettings(restaurantData.ticket_print_settings));
        setSaveOk(false);
        setSaveError(null);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setLoadError(
            error instanceof ApiError
              ? error.message
              : 'No se pudo cargar la configuración de la impresora.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, accessLoading, authLoading, selectedRestaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    void primeKitchenPrinterConnections(restaurantId);
  }, [restaurantId]);

  async function handleSave() {
    if (!accessToken || !restaurantId) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const updated = await updateRestaurant(accessToken, restaurantId, {
        ticket_print_settings: ticketSettings,
      });
      setRestaurant(updated);
      setTicketSettings(normalizeTicketPrintSettings(updated.ticket_print_settings));
      setSaveOk(true);
    } catch (error) {
      console.error(error);
      setSaveError(
        error instanceof ApiError
          ? error.message
          : 'No se pudo guardar el diseño del ticket.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading || authLoading || accessLoading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Cargando impresora…</p>
      </div>
    );
  }

  if (loadError || !restaurant || !restaurantId) {
    return (
      <div className={styles.page}>
        <p className={styles.errorBanner}>{loadError ?? 'No se encontró el restaurante.'}</p>
      </div>
    );
  }

  const logoUrl = storagePublicUrl(restaurant.logo_path);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Impresora</h1>
          <p className={styles.subtitle}>
            Conecta la impresora de tickets y elige qué se imprime al confirmar un pedido.
          </p>
        </div>
        <div className={styles.headerActions}>
          <div
            className={`${styles.printerChip} ${hasDefaultKitchenPrinter(defaultPrinter) ? styles.printerChipOn : ''}`}
            role="status"
          >
            <PrintOutlinedIcon className={styles.printerChipIcon} aria-hidden />
            <span className={styles.printerChipCopy}>
              <span className={styles.printerChipLabel}>Impresora predeterminada</span>
              <span className={styles.printerChipName}>
                {defaultPrinterDisplayName(defaultPrinter)}
              </span>
            </span>
          </div>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Guardando…' : saveOk ? 'Cambios guardados' : 'Guardar diseño'}
          </button>
        </div>
      </div>

      {saveError ? (
        <p className={styles.errorBanner} role="alert">
          {saveError}
        </p>
      ) : null}

      <TicketPrinterSettings
        restaurantId={restaurantId}
        restaurantName={restaurant.name}
        restaurantAddress={restaurant.address ?? ''}
        logoUrl={logoUrl}
        value={ticketSettings}
        onChange={(next) => {
          setTicketSettings(next);
          setSaveOk(false);
        }}
        onPrinterChange={setDefaultPrinter}
        accessToken={accessToken}
      />
    </div>
  );
}
