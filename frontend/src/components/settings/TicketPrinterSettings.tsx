'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import UsbOutlinedIcon from '@mui/icons-material/UsbOutlined';
import CableOutlinedIcon from '@mui/icons-material/CableOutlined';
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined';
import BluetoothOutlinedIcon from '@mui/icons-material/BluetoothOutlined';
import WifiOutlinedIcon from '@mui/icons-material/WifiOutlined';
import { KitchenTicketPreview } from '@/components/print/KitchenTicketPreview';
import { previewKitchenTicketDocument } from '@/lib/print/ticketDocument';
import { printKitchenTicketDocument } from '@/lib/print/printKitchenTicket';
import {
  discoverKitchenNetworkPrinters,
  type KitchenNetworkPrinter,
} from '@/lib/api/restaurants';
import { ApiError } from '@/lib/api/types';
import {
  canUseWebBluetooth,
  canUseWebSerial,
  canUseWebUsb,
  clearKitchenPrinterPreference,
  defaultPrinterDisplayName,
  hasDefaultKitchenPrinter,
  isLanPrinterIpv4,
  pairBluetoothKitchenPrinter,
  pairNetworkKitchenPrinter,
  pairSerialKitchenPrinter,
  pairUsbKitchenPrinter,
  printerKindLabel,
  readKitchenPrinterPreference,
  useSystemKitchenPrinter,
  type KitchenPrinterPreference,
} from '@/lib/print/kitchenPrinterDevice';
import {
  DEFAULT_TICKET_PRINT_SETTINGS,
  type TicketPrintSettings,
} from '@/lib/print/ticketSettings';
import styles from './TicketPrinterSettings.module.css';

function Switch({
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <label className={styles.switch}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.slider} aria-hidden="true" />
    </label>
  );
}

function FieldToggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.toggleRow}>
      <div>
        <p className={styles.toggleLabel}>{label}</p>
        {hint ? <p className={styles.toggleHint}>{hint}</p> : null}
      </div>
      <Switch checked={checked} onChange={onChange} ariaLabel={label} disabled={disabled} />
    </div>
  );
}

export function TicketPrinterSettings({
  restaurantId,
  restaurantName,
  restaurantAddress,
  logoUrl,
  value,
  onChange,
  onPrinterChange,
  accessToken,
}: {
  restaurantId: string;
  restaurantName: string;
  restaurantAddress: string;
  logoUrl: string | null;
  value: TicketPrintSettings;
  onChange: (next: TicketPrintSettings) => void;
  onPrinterChange?: (next: KitchenPrinterPreference) => void;
  accessToken?: string | null;
}) {
  const [printer, setPrinterState] = useState<KitchenPrinterPreference>(() =>
    readKitchenPrinterPreference(restaurantId),
  );

  const setPrinter = (next: KitchenPrinterPreference) => {
    setPrinterState(next);
    onPrinterChange?.(next);
  };

  const [printerBusy, setPrinterBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [networkHost, setNetworkHost] = useState('');
  const [networkPrinters, setNetworkPrinters] = useState<KitchenNetworkPrinter[]>([]);
  const [networkHint, setNetworkHint] = useState<string | null>(null);
  const [printerMessage, setPrinterMessage] = useState<string | null>(null);
  const [printerError, setPrinterError] = useState<string | null>(null);

  const onPrinterChangeRef = useRef(onPrinterChange);
  onPrinterChangeRef.current = onPrinterChange;

  useEffect(() => {
    const next = readKitchenPrinterPreference(restaurantId);
    setPrinterState(next);
    onPrinterChangeRef.current?.(next);
    setPrinterMessage(null);
    setPrinterError(null);
    setNetworkPrinters([]);
    setNetworkHint(null);
    if (next.kind === 'network' && next.host) setNetworkHost(next.host);
  }, [restaurantId]);

  const preview = useMemo(
    () =>
      previewKitchenTicketDocument({
        settings: value,
        restaurantName,
        restaurantAddress,
        logoUrl: value.show_logo ? logoUrl : null,
      }),
    [logoUrl, restaurantAddress, restaurantName, value],
  );

  const patch = (partial: Partial<TicketPrintSettings>) => {
    onChange({ ...value, ...partial });
  };

  async function connectUsb() {
    setPrinterBusy(true);
    setPrinterError(null);
    setPrinterMessage(null);
    try {
      const next = await pairUsbKitchenPrinter(restaurantId);
      setPrinter(next);
      setPrinterMessage(`Predeterminada: ${next.label}. Los tickets se imprimen en silencio.`);
    } catch (error) {
      setPrinterError(
        error instanceof Error ? error.message : 'No se pudo conectar la impresora USB.',
      );
    } finally {
      setPrinterBusy(false);
    }
  }

  async function connectSerial() {
    setPrinterBusy(true);
    setPrinterError(null);
    setPrinterMessage(null);
    try {
      const next = await pairSerialKitchenPrinter(restaurantId);
      setPrinter(next);
      setPrinterMessage(`Predeterminada: puerto serie. Los tickets se enviarán a esa impresora.`);
    } catch (error) {
      setPrinterError(
        error instanceof Error ? error.message : 'No se pudo conectar el puerto serie.',
      );
    } finally {
      setPrinterBusy(false);
    }
  }

  async function connectBluetooth() {
    setPrinterBusy(true);
    setPrinterError(null);
    setPrinterMessage(null);
    try {
      const next = await pairBluetoothKitchenPrinter(restaurantId);
      setPrinter(next);
      setPrinterMessage(
        next.kind === 'system'
          ? 'Esta impresora no admite Bluetooth directo. Los tickets usarán el diálogo de impresión del sistema.'
          : `Predeterminada: ${next.label}. Los tickets se enviarán por Bluetooth.`,
      );
    } catch (error) {
      setPrinterError(
        error instanceof Error ? error.message : 'No se pudo conectar la impresora Bluetooth.',
      );
    } finally {
      setPrinterBusy(false);
    }
  }

  function useSystem() {
    const next = useSystemKitchenPrinter(restaurantId);
    setPrinter(next);
    setPrinterError(null);
    setPrinterMessage('Predeterminada: impresora del sistema.');
  }

  function selectNetworkPrinter(host: string, port = 9100) {
    const next = pairNetworkKitchenPrinter(restaurantId, host, port);
    setPrinter(next);
    setNetworkHost(host);
    setPrinterError(null);
    setPrinterMessage(`Predeterminada: ${defaultPrinterDisplayName(next)}.`);
  }

  async function discoverNetwork() {
    if (!accessToken) {
      setPrinterError('Inicia sesión para buscar impresoras en la red.');
      return;
    }
    setNetworkBusy(true);
    setPrinterError(null);
    setPrinterMessage(null);
    setNetworkHint(null);
    try {
      const result = await discoverKitchenNetworkPrinters(accessToken, restaurantId);
      setNetworkPrinters(result.items);
      setNetworkHint(result.message);
      if (result.items.length === 1 && result.items[0]) {
        selectNetworkPrinter(result.items[0].host, result.items[0].port);
      } else if (result.items.length > 1) {
        setPrinterMessage(`Se encontraron ${result.items.length} impresoras. Elige una.`);
      }
    } catch (error) {
      setNetworkPrinters([]);
      setPrinterError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'No se pudieron buscar impresoras en la red.',
      );
    } finally {
      setNetworkBusy(false);
    }
  }

  function useNetworkIp() {
    if (!isLanPrinterIpv4(networkHost)) {
      setPrinterError('Escribe una IP local, por ejemplo 192.168.1.50.');
      return;
    }
    selectNetworkPrinter(networkHost.trim());
  }

  function clearDefault() {
    const next = clearKitchenPrinterPreference(restaurantId);
    setPrinter(next);
    setPrinterError(null);
    setPrinterMessage('Se quitó la impresora predeterminada. La impresión automática no se usará.');
    if (value.enabled) patch({ enabled: false });
  }

  async function testPrint() {
    setTestBusy(true);
    setPrinterError(null);
    setPrinterMessage(null);
    try {
      const result = await printKitchenTicketDocument(restaurantId, preview, { accessToken });
      if (result.status === 'failed') {
        setPrinterError(result.error);
        return;
      }
      if (result.status === 'printed') {
        setPrinterMessage(
          result.method === 'system'
            ? 'Se abrió el diálogo de impresión. Elige tu impresora térmica.'
            : `Ticket de prueba enviado a ${printerKindLabel(result.method)}.`,
        );
      }
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="printer-setup">
      <div className={styles.heading}>
        <h2 id="printer-setup" className={styles.panelTitle}>
          Impresora de tickets
        </h2>
        <p className={styles.panelHint}>
          Elige una impresora predeterminada y activa la impresión automática si quieres tickets al
          confirmar. Recoger en local se imprime al confirmar; delivery, al continuar y solicitar
          repartidor.
        </p>
      </div>

      <div className={styles.printerCard}>
        <div className={styles.printerStatus}>
          <span
            className={`${styles.statusDot} ${hasDefaultKitchenPrinter(printer) ? styles.statusOn : ''}`}
            aria-hidden
          />
          <div className={styles.printerIdentity}>
            <p className={styles.printerEyebrow}>Impresora predeterminada</p>
            <p className={styles.printerName}>{defaultPrinterDisplayName(printer)}</p>
            <p className={styles.printerMeta}>
              {hasDefaultKitchenPrinter(printer) ? (
                <>
                  <span className={styles.defaultBadge}>Activa</span>
                  {printerKindLabel(printer.kind)}
                </>
              ) : (
                'Ninguna conectada. Conecta USB, Bluetooth, Wi‑Fi/Ethernet o elige la impresora del sistema.'
              )}
            </p>
          </div>
        </div>
        <div className={styles.printerActions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={printerBusy || !canUseWebUsb()}
            onClick={() => void connectUsb()}
          >
            <UsbOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            {canUseWebUsb() ? 'Conectar USB' : 'USB no disponible'}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={printerBusy || !canUseWebBluetooth()}
            onClick={() => void connectBluetooth()}
          >
            <BluetoothOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            {canUseWebBluetooth() ? 'Conectar Bluetooth' : 'Bluetooth no disponible'}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={printerBusy || !canUseWebSerial()}
            onClick={() => void connectSerial()}
          >
            <CableOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            Puerto serie
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={printerBusy || networkBusy || !accessToken}
            onClick={() => void discoverNetwork()}
          >
            <WifiOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            {networkBusy ? 'Buscando en la red…' : 'Buscar Wi‑Fi / Ethernet'}
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={useSystem}>
            <DesktopWindowsOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            Usar sistema
          </button>
          {hasDefaultKitchenPrinter(printer) ? (
            <button type="button" className={styles.secondaryBtn} onClick={clearDefault}>
              Quitar predeterminada
            </button>
          ) : null}
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={testBusy || !hasDefaultKitchenPrinter(printer)}
            onClick={() => void testPrint()}
          >
            <PrintOutlinedIcon sx={{ fontSize: 18 }} aria-hidden />
            {testBusy ? 'Imprimiendo…' : 'Imprimir prueba'}
          </button>
        </div>
        <div className={styles.networkPanel}>
          <p className={styles.networkTitle}>Impresora de red</p>
          {networkPrinters.length > 0 ? (
            <div className={styles.networkList} role="list">
              {networkPrinters.map((item) => (
                <button
                  key={`${item.host}:${item.port}`}
                  type="button"
                  role="listitem"
                  className={`${styles.networkItem} ${printer.kind === 'network' && printer.host === item.host ? styles.networkItemActive : ''}`}
                  onClick={() => selectNetworkPrinter(item.host, item.port)}
                >
                  {item.host}
                  {item.port !== 9100 ? `:${item.port}` : ''}
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.networkManual}>
            <label className={styles.field} htmlFor="network-printer-ip">
              <span className={styles.fieldLabel}>IP de la impresora</span>
              <input
                id="network-printer-ip"
                className={styles.input}
                inputMode="decimal"
                autoComplete="off"
                placeholder="192.168.1.50"
                value={networkHost}
                onChange={(event) => setNetworkHost(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={networkBusy}
              onClick={useNetworkIp}
            >
              Usar esta IP
            </button>
          </div>
          {networkHint ? <p className={styles.helpText}>{networkHint}</p> : null}
        </div>
        <FieldToggle
          label="Imprimir automáticamente al confirmar pedido"
          hint={
            hasDefaultKitchenPrinter(printer)
              ? 'Recoger en local: al confirmar. Delivery: al continuar y solicitar repartidor.'
              : 'Primero elige una impresora predeterminada. Si no, no se imprime solo.'
          }
          checked={value.enabled && hasDefaultKitchenPrinter(printer)}
          disabled={!hasDefaultKitchenPrinter(printer)}
          onChange={(enabled) => patch({ enabled })}
        />
        {printerMessage ? <p className={styles.okText}>{printerMessage}</p> : null}
        {printerError ? (
          <p className={styles.errorText} role="alert">
            {printerError}
          </p>
        ) : null}
        <p className={styles.helpText}>
          USB, Bluetooth y red funcionan en Chrome o Edge. La búsqueda Wi‑Fi/Ethernet recorre el
          puerto 9100 desde el servidor. Si no aparece, escribe la IP. En iPhone/iPad, o Bluetooth
          clásico, usa “Usar sistema”.
        </p>
      </div>

      <div className={styles.layout}>
        <div className={styles.editor}>
          <div className={styles.segmentRow}>
            <span className={styles.fieldLabel} id="ticket-paper-width">
              Ancho del papel
            </span>
            <div className={styles.segments} role="group" aria-labelledby="ticket-paper-width">
              {([58, 80] as const).map((width) => (
                <button
                  key={width}
                  type="button"
                  className={`${styles.segment} ${value.paper_width_mm === width ? styles.segmentActive : ''}`}
                  aria-pressed={value.paper_width_mm === width}
                  onClick={() => patch({ paper_width_mm: width })}
                >
                  {width} mm
                </button>
              ))}
            </div>
          </div>

          <label className={styles.field} htmlFor="ticket-copies">
            Copias
            <select
              id="ticket-copies"
              className={styles.input}
              value={value.copies}
              onChange={(event) => patch({ copies: Number(event.target.value) })}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>

          <label className={styles.field} htmlFor="ticket-brand">
            Nombre en el ticket
            <input
              id="ticket-brand"
              className={styles.input}
              value={value.brand_name}
              placeholder={restaurantName || DEFAULT_TICKET_PRINT_SETTINGS.brand_name}
              onChange={(event) => patch({ brand_name: event.target.value })}
            />
          </label>

          <label className={styles.field} htmlFor="ticket-header">
            Texto extra del encabezado
            <textarea
              id="ticket-header"
              className={styles.textarea}
              rows={2}
              maxLength={240}
              placeholder="RFC, sucursal, slogan…"
              value={value.header_extra}
              onChange={(event) => patch({ header_extra: event.target.value })}
            />
          </label>

          <label className={styles.field} htmlFor="ticket-footer">
            Pie de ticket
            <textarea
              id="ticket-footer"
              className={styles.textarea}
              rows={2}
              maxLength={240}
              value={value.footer_message}
              onChange={(event) => patch({ footer_message: event.target.value })}
            />
          </label>

          <div className={styles.toggleGrid}>
            <FieldToggle
              label="Mostrar logo"
              checked={value.show_logo}
              onChange={(show_logo) => patch({ show_logo })}
            />
            <FieldToggle
              label="Dirección del negocio"
              checked={value.show_restaurant_address}
              onChange={(show_restaurant_address) => patch({ show_restaurant_address })}
            />
            <FieldToggle
              label="Tipo de pedido"
              checked={value.show_order_type}
              onChange={(show_order_type) => patch({ show_order_type })}
            />
            <FieldToggle
              label="Fecha y hora"
              checked={value.show_datetime}
              onChange={(show_datetime) => patch({ show_datetime })}
            />
            <FieldToggle
              label="Cliente"
              checked={value.show_customer}
              onChange={(show_customer) => patch({ show_customer })}
            />
            <FieldToggle
              label="Teléfono"
              checked={value.show_phone}
              onChange={(show_phone) => patch({ show_phone })}
            />
            <FieldToggle
              label="Dirección de entrega"
              hint="Solo en pedidos delivery"
              checked={value.show_address}
              onChange={(show_address) => patch({ show_address })}
            />
            <FieldToggle
              label="Método de pago"
              checked={value.show_payment}
              onChange={(show_payment) => patch({ show_payment })}
            />
            <FieldToggle
              label="Notas del cliente"
              checked={value.show_notes}
              onChange={(show_notes) => patch({ show_notes })}
            />
            <FieldToggle
              label="Lista de artículos"
              checked={value.show_items}
              onChange={(show_items) => patch({ show_items })}
            />
          </div>
        </div>

        <div className={styles.previewCol}>
          <p className={styles.previewLabel}>Vista previa</p>
          <KitchenTicketPreview document={preview} />
        </div>
      </div>
    </section>
  );
}
