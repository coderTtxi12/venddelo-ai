const STORAGE_PREFIX = 'venddelo:kitchen-printer:';

export type KitchenPrinterKind = 'none' | 'system' | 'usb' | 'serial' | 'bluetooth' | 'network';

export type KitchenPrinterPreference = {
  kind: KitchenPrinterKind;
  label: string;
  bluetoothDeviceId?: string;
  host?: string;
  port?: number;
  systemPrinterName?: string;
};

export const EMPTY_KITCHEN_PRINTER: KitchenPrinterPreference = {
  kind: 'none',
  label: 'Sin impresora predeterminada',
};

const USB_FILTERS: Array<{ vendorId?: number; classCode?: number }> = [
  { classCode: 7 },
  { vendorId: 0x04b8 },
  { vendorId: 0x0519 },
  { vendorId: 0x0fe6 },
  { vendorId: 0x0483 },
  { vendorId: 0x0416 },
  { vendorId: 0x1fc9 },
  { vendorId: 0x0525 },
  { vendorId: 0x1504 },
  { vendorId: 0x28e9 },
  { vendorId: 0x0493 },
  { vendorId: 0x0dd4 },
  { vendorId: 0x6868 },
];

const BLE_OPTIONAL_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ffe5-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ff10-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

export const CLASSIC_BLUETOOTH_FALLBACK = 'CLASSIC_BLUETOOTH_FALLBACK';

type UsbLike = {
  opened: boolean;
  productName?: string;
  manufacturerName?: string;
  configuration: { interfaces: UsbInterfaceLike[] } | null;
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (value: number) => Promise<void>;
  claimInterface: (value: number) => Promise<void>;
  releaseInterface: (value: number) => Promise<void>;
  transferOut: (endpointNumber: number, data: Uint8Array) => Promise<unknown>;
};

type UsbInterfaceLike = {
  claimed: boolean;
  interfaceNumber: number;
  alternate: {
    endpoints: Array<{ direction: string; endpointNumber: number; type: string }>;
  };
};

type SerialPortLike = {
  readable: unknown;
  writable: { getWriter: () => { write: (data: Uint8Array) => Promise<void>; releaseLock: () => void } } | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
};

type BluetoothCharacteristicLike = {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValue?: (data: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
};

type BluetoothServiceLike = {
  getCharacteristics: () => Promise<BluetoothCharacteristicLike[]>;
};

type BluetoothRemoteGattLike = {
  connected?: boolean;
  connect: () => Promise<BluetoothRemoteGattLike>;
  getPrimaryServices: () => Promise<BluetoothServiceLike[]>;
};

type BluetoothDeviceLike = {
  id?: string;
  name?: string;
  gatt?: BluetoothRemoteGattLike;
  watchAdvertisements?: () => Promise<void>;
};

const bluetoothDeviceCache = new Map<string, BluetoothDeviceLike>();

function usbNavigator(): {
  requestDevice: (opts: { filters: typeof USB_FILTERS }) => Promise<UsbLike>;
  getDevices: () => Promise<UsbLike[]>;
} | null {
  const usb = (navigator as Navigator & { usb?: unknown }).usb as
    | {
        requestDevice: (opts: { filters: typeof USB_FILTERS }) => Promise<UsbLike>;
        getDevices: () => Promise<UsbLike[]>;
      }
    | undefined;
  return usb ?? null;
}

function serialNavigator(): {
  requestPort: () => Promise<SerialPortLike>;
  getPorts: () => Promise<SerialPortLike[]>;
} | null {
  const serial = (navigator as Navigator & { serial?: unknown }).serial as
    | {
        requestPort: () => Promise<SerialPortLike>;
        getPorts: () => Promise<SerialPortLike[]>;
      }
    | undefined;
  return serial ?? null;
}

type BluetoothRequestOptions = {
  acceptAllDevices?: boolean;
  filters?: Array<{ name?: string; namePrefix?: string }>;
  optionalServices?: string[];
};

function bluetoothNavigator(): {
  requestDevice: (opts: BluetoothRequestOptions) => Promise<BluetoothDeviceLike>;
  getDevices?: () => Promise<BluetoothDeviceLike[]>;
} | null {
  const bluetooth = (navigator as Navigator & { bluetooth?: unknown }).bluetooth as
    | {
        requestDevice: (opts: BluetoothRequestOptions) => Promise<BluetoothDeviceLike>;
        getDevices?: () => Promise<BluetoothDeviceLike[]>;
      }
    | undefined;
  return bluetooth ?? null;
}

export function kitchenPrinterStorageKey(restaurantId: string): string {
  return `${STORAGE_PREFIX}${restaurantId}`;
}

export function parseKitchenPrinterPreference(raw: string | null): KitchenPrinterPreference {
  if (!raw) return EMPTY_KITCHEN_PRINTER;
  try {
    const parsed = JSON.parse(raw) as Partial<KitchenPrinterPreference>;
    if (
      parsed.kind === 'usb' ||
      parsed.kind === 'serial' ||
      parsed.kind === 'system' ||
      parsed.kind === 'bluetooth' ||
      parsed.kind === 'network'
    ) {
      const host =
        parsed.kind === 'network' && typeof parsed.host === 'string' ? parsed.host.trim() : undefined;
      const port =
        parsed.kind === 'network' && typeof parsed.port === 'number' && Number.isInteger(parsed.port)
          ? parsed.port
          : parsed.kind === 'network'
            ? 9100
            : undefined;
      const systemPrinterName =
        parsed.kind === 'system' &&
        typeof parsed.systemPrinterName === 'string' &&
        parsed.systemPrinterName.trim()
          ? parsed.systemPrinterName.trim()
          : undefined;
      if (parsed.kind === 'network' && !host) {
        return EMPTY_KITCHEN_PRINTER;
      }
      return {
        kind: parsed.kind,
        label:
          typeof parsed.label === 'string' && parsed.label.trim()
            ? parsed.label
            : printerKindLabel(parsed.kind),
        bluetoothDeviceId:
          parsed.kind === 'bluetooth' &&
          typeof parsed.bluetoothDeviceId === 'string' &&
          parsed.bluetoothDeviceId.trim()
            ? parsed.bluetoothDeviceId.trim()
            : undefined,
        host,
        port,
        systemPrinterName,
      };
    }
  } catch {
    // ignore corrupt storage
  }
  return EMPTY_KITCHEN_PRINTER;
}

export function readKitchenPrinterPreference(restaurantId: string): KitchenPrinterPreference {
  if (typeof window === 'undefined') return EMPTY_KITCHEN_PRINTER;
  return parseKitchenPrinterPreference(window.localStorage.getItem(kitchenPrinterStorageKey(restaurantId)));
}

export function writeKitchenPrinterPreference(
  restaurantId: string,
  preference: KitchenPrinterPreference,
): void {
  if (preference.kind !== 'bluetooth') {
    bluetoothDeviceCache.delete(restaurantId);
  }
  if (typeof window === 'undefined') return;
  if (preference.kind === 'none') {
    window.localStorage.removeItem(kitchenPrinterStorageKey(restaurantId));
    return;
  }
  window.localStorage.setItem(kitchenPrinterStorageKey(restaurantId), JSON.stringify(preference));
}

export function clearKitchenPrinterPreference(restaurantId: string): KitchenPrinterPreference {
  writeKitchenPrinterPreference(restaurantId, EMPTY_KITCHEN_PRINTER);
  return EMPTY_KITCHEN_PRINTER;
}

export function hasDefaultKitchenPrinter(preference: KitchenPrinterPreference): boolean {
  return preference.kind !== 'none';
}

export function defaultPrinterDisplayName(preference: KitchenPrinterPreference): string {
  if (!hasDefaultKitchenPrinter(preference)) return EMPTY_KITCHEN_PRINTER.label;
  if (preference.kind === 'network' && preference.host) {
    const port = preference.port && preference.port !== 9100 ? `:${preference.port}` : '';
    const named = preference.label.trim();
    if (named && named !== printerKindLabel('network') && !named.includes(preference.host)) {
      return `${named} (${preference.host}${port})`;
    }
    return `${preference.host}${port}`;
  }
  if (preference.kind === 'system' && preference.systemPrinterName) {
    return preference.systemPrinterName;
  }
  return preference.label.trim() || printerKindLabel(preference.kind);
}

export function printerKindLabel(kind: KitchenPrinterKind): string {
  if (kind === 'usb') return 'USB';
  if (kind === 'serial') return 'Puerto serie';
  if (kind === 'bluetooth') return 'Bluetooth';
  if (kind === 'network') return 'Wi‑Fi / Ethernet';
  if (kind === 'system') return 'Impresora del sistema';
  return 'Sin impresora';
}

export function isLanPrinterIpv4(value: string): boolean {
  const parts = value.trim().split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const first = octets[0];
  const second = octets[1];
  if (first === 10) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second != null && second >= 16 && second <= 31) return true;
  if (first === 169 && second === 254) return true;
  return false;
}

export function canUseWebUsb(): boolean {
  return typeof navigator !== 'undefined' && usbNavigator() != null;
}

export function canUseWebSerial(): boolean {
  return typeof navigator !== 'undefined' && serialNavigator() != null;
}

export function canUseWebBluetooth(): boolean {
  return typeof navigator !== 'undefined' && bluetoothNavigator() != null;
}

function deviceLabel(device: UsbLike): string {
  return [device.manufacturerName, device.productName].filter(Boolean).join(' ') || 'Impresora USB';
}

export async function pairUsbKitchenPrinter(restaurantId: string): Promise<KitchenPrinterPreference> {
  const usb = usbNavigator();
  if (!usb) {
    throw new Error('Este navegador no permite conectar impresoras USB. Usa Chrome o Edge.');
  }
  const device = await usb.requestDevice({ filters: USB_FILTERS });
  const preference: KitchenPrinterPreference = { kind: 'usb', label: deviceLabel(device) };
  writeKitchenPrinterPreference(restaurantId, preference);
  return preference;
}

export async function pairSerialKitchenPrinter(restaurantId: string): Promise<KitchenPrinterPreference> {
  const serial = serialNavigator();
  if (!serial) {
    throw new Error('Este navegador no permite puertos serie. Usa Chrome o Edge.');
  }
  await serial.requestPort();
  const preference: KitchenPrinterPreference = { kind: 'serial', label: 'Puerto serie' };
  writeKitchenPrinterPreference(restaurantId, preference);
  return preference;
}

export async function pairBluetoothKitchenPrinter(
  restaurantId: string,
): Promise<KitchenPrinterPreference> {
  const device = await requestBluetoothDevice();
  return persistPairedBluetoothDevice(restaurantId, device);
}

export async function primeKitchenPrinterConnections(restaurantId: string): Promise<void> {
  const preference = readKitchenPrinterPreference(restaurantId);
  if (preference.kind !== 'bluetooth') return;
  const bluetooth = bluetoothNavigator();
  if (!bluetooth?.getDevices) return;
  try {
    const devices = await bluetooth.getDevices();
    const device = pickBluetoothDevice(devices, preference.bluetoothDeviceId);
    if (device) rememberBluetoothDevice(restaurantId, device);
  } catch {
    // Chrome may deny getDevices until the next user gesture; printing will retry.
  }
}

export function pairNetworkKitchenPrinter(
  restaurantId: string,
  host: string,
  port = 9100,
): KitchenPrinterPreference {
  const trimmed = host.trim();
  const preference: KitchenPrinterPreference = {
    kind: 'network',
    label: `Impresora de red ${trimmed}`,
    host: trimmed,
    port,
  };
  writeKitchenPrinterPreference(restaurantId, preference);
  return preference;
}

export function useSystemKitchenPrinter(
  restaurantId: string,
  printerName?: string,
): KitchenPrinterPreference {
  const trimmed = printerName?.trim();
  const preference: KitchenPrinterPreference = {
    kind: 'system',
    label: trimmed || 'Impresora del sistema',
    systemPrinterName: trimmed,
  };
  writeKitchenPrinterPreference(restaurantId, preference);
  return preference;
}

async function writeUsbBytes(data: Uint8Array): Promise<void> {
  const usb = usbNavigator();
  if (!usb) throw new Error('USB no disponible');
  let device = (await usb.getDevices())[0];
  if (!device) {
    try {
      device = await usb.requestDevice({ filters: USB_FILTERS });
    } catch {
      throw new Error('No hay una impresora USB autorizada en este equipo.');
    }
  }
  if (!device.opened) await device.open();
  if (device.configuration == null) await device.selectConfiguration(1);
  const iface = device.configuration?.interfaces[0];
  if (!iface) throw new Error('No se encontró la interfaz de la impresora USB.');
  if (!iface.claimed) await device.claimInterface(iface.interfaceNumber);
  const endpoint = iface.alternate.endpoints.find(
    (item) => item.direction === 'out' && (item.type === 'bulk' || item.type === 'interrupt'),
  );
  if (!endpoint) throw new Error('La impresora USB no tiene un canal de salida.');
  await device.transferOut(endpoint.endpointNumber, data);
  try {
    await device.releaseInterface(iface.interfaceNumber);
    await device.close();
  } catch {
    // some devices error on close; bytes were already sent
  }
}

async function writeSerialBytes(data: Uint8Array): Promise<void> {
  const serial = serialNavigator();
  if (!serial) throw new Error('Puerto serie no disponible');
  const ports = await serial.getPorts();
  let port = ports[0];
  if (!port) {
    try {
      port = await serial.requestPort();
    } catch {
      throw new Error('No hay un puerto serie autorizado en este equipo.');
    }
  }
  await port.open({ baudRate: 9600 });
  try {
    const writer = port.writable?.getWriter();
    if (!writer) throw new Error('El puerto serie no admite escritura.');
    await writer.write(data);
    writer.releaseLock();
  } finally {
    await port.close();
  }
}

function chunkBytes(data: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.byteLength; offset += size) {
    chunks.push(data.subarray(offset, offset + size));
  }
  return chunks;
}

async function findWritableCharacteristic(
  services: BluetoothServiceLike[],
): Promise<BluetoothCharacteristicLike | null> {
  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    const writable = characteristics.find(
      (item) => item.properties.writeWithoutResponse || item.properties.write,
    );
    if (writable) return writable;
  }
  return null;
}

function isUserCancelledBluetooth(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = 'name' in error ? String((error as { name?: string }).name) : '';
  return name === 'NotFoundError' || name === 'AbortError' || /canceló|canceled|cancelled/i.test(error.message);
}

function rememberBluetoothDevice(restaurantId: string, device: BluetoothDeviceLike): void {
  bluetoothDeviceCache.set(restaurantId, device);
  if (typeof device.watchAdvertisements === 'function') {
    void device.watchAdvertisements().catch(() => undefined);
  }
}

function pickBluetoothDevice(
  devices: BluetoothDeviceLike[],
  deviceId?: string,
): BluetoothDeviceLike | null {
  if (deviceId) {
    const match = devices.find((item) => item.id === deviceId);
    if (match) return match;
  }
  return devices.find((item) => item.gatt) ?? devices[0] ?? null;
}

async function requestBluetoothDevice(): Promise<BluetoothDeviceLike> {
  const bluetooth = bluetoothNavigator();
  if (!bluetooth) {
    throw new Error('Este navegador no permite Bluetooth. Usa Chrome o Edge con Bluetooth activado.');
  }
  return bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: BLE_OPTIONAL_SERVICES,
  });
}

async function persistPairedBluetoothDevice(
  restaurantId: string,
  device: BluetoothDeviceLike,
): Promise<KitchenPrinterPreference> {
  if (!device.gatt) {
    return useSystemKitchenPrinter(restaurantId);
  }
  try {
    if (!device.gatt.connected) await device.gatt.connect();
  } catch {
    return useSystemKitchenPrinter(restaurantId);
  }
  rememberBluetoothDevice(restaurantId, device);
  const preference: KitchenPrinterPreference = {
    kind: 'bluetooth',
    label: device.name?.trim() || 'Impresora Bluetooth',
    bluetoothDeviceId: device.id,
  };
  writeKitchenPrinterPreference(restaurantId, preference);
  return preference;
}

async function resolveBluetoothDevice(restaurantId: string): Promise<BluetoothDeviceLike> {
  const cached = bluetoothDeviceCache.get(restaurantId);
  if (cached?.gatt) return cached;

  const preference = readKitchenPrinterPreference(restaurantId);
  const bluetooth = bluetoothNavigator();
  if (!bluetooth) throw new Error('Bluetooth no disponible');

  const known = bluetooth.getDevices ? await bluetooth.getDevices() : [];
  const fromBrowser = pickBluetoothDevice(known, preference.bluetoothDeviceId);
  if (fromBrowser?.gatt) {
    rememberBluetoothDevice(restaurantId, fromBrowser);
    return fromBrowser;
  }

  try {
    const device = await requestBluetoothDevice();
    const persisted = await persistPairedBluetoothDevice(restaurantId, device);
    if (persisted.kind !== 'bluetooth') {
      throw new Error(CLASSIC_BLUETOOTH_FALLBACK);
    }
    const resolved = bluetoothDeviceCache.get(restaurantId);
    if (resolved?.gatt) return resolved;
  } catch (error) {
    if (error instanceof Error && error.message === CLASSIC_BLUETOOTH_FALLBACK) throw error;
    if (isUserCancelledBluetooth(error)) {
      throw new Error('Se canceló la conexión Bluetooth.');
    }
    throw error;
  }
  throw new Error('No se pudo conectar la impresora Bluetooth.');
}

async function writeBluetoothBytes(restaurantId: string, data: Uint8Array): Promise<void> {
  const device = await resolveBluetoothDevice(restaurantId);
  if (!device.gatt) throw new Error(CLASSIC_BLUETOOTH_FALLBACK);
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const services = await server.getPrimaryServices();
  const characteristic = await findWritableCharacteristic(services);
  if (!characteristic) {
    throw new Error('La impresora Bluetooth no acepta escritura de tickets.');
  }
  for (const chunk of chunkBytes(data, 20)) {
    const payload = new Uint8Array(chunk);
    if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(payload);
    } else if (characteristic.writeValue) {
      await characteristic.writeValue(payload);
    } else {
      throw new Error('La impresora Bluetooth no acepta escritura de tickets.');
    }
    await new Promise((resolve) => {
      window.setTimeout(resolve, 8);
    });
  }
}

export async function sendEscPosToKitchenPrinter(
  restaurantId: string,
  payload: Uint8Array,
): Promise<KitchenPrinterKind> {
  const preference = readKitchenPrinterPreference(restaurantId);
  if (preference.kind === 'usb') {
    await writeUsbBytes(payload);
    return 'usb';
  }
  if (preference.kind === 'serial') {
    await writeSerialBytes(payload);
    return 'serial';
  }
  if (preference.kind === 'bluetooth') {
    await writeBluetoothBytes(restaurantId, payload);
    return 'bluetooth';
  }
  if (preference.kind === 'system') {
    throw new Error('SYSTEM');
  }
  throw new Error('NO_PRINTER');
}
