import 'package:flutter/services.dart';

import '../state/owner_store.dart';

class PrinterCapabilities {
  const PrinterCapabilities({
    required this.platform,
    required this.bluetooth,
    required this.usb,
    required this.network,
    required this.note,
  });

  final String platform;
  final bool bluetooth;
  final bool usb;
  final bool network;
  final String note;

  static const fallback = PrinterCapabilities(
    platform: 'unknown',
    bluetooth: false,
    usb: false,
    network: true,
    note: 'Puedes guardar una impresora por IP. La búsqueda del equipo no está disponible en esta sesión.',
  );
}

class PrinterScan {
  const PrinterScan({
    required this.printers,
    required this.needsPermission,
    this.message,
  });

  final List<PrinterDevice> printers;
  final bool needsPermission;
  final String? message;
}

class PrinterChannel {
  static const _channel = MethodChannel('com.mexy.owner/printer');

  static Future<PrinterCapabilities> capabilities() async {
    try {
      final raw = await _channel.invokeMapMethod<Object?, Object?>('capabilities');
      if (raw == null) return PrinterCapabilities.fallback;
      return PrinterCapabilities(
        platform: raw['platform'] as String? ?? 'unknown',
        bluetooth: raw['bluetooth'] == true,
        usb: raw['usb'] == true,
        network: raw['network'] != false,
        note: raw['note'] as String? ?? PrinterCapabilities.fallback.note,
      );
    } on PlatformException {
      return PrinterCapabilities.fallback;
    } on MissingPluginException {
      return PrinterCapabilities.fallback;
    }
  }

  static Future<bool> requestBluetooth() async {
    try {
      final granted = await _channel.invokeMethod<bool>('requestBluetooth');
      return granted ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  static Future<PrinterScan> bondedPrinters() => _scan('bondedPrinters');

  static Future<PrinterScan> usbPrinters() => _scan('usbPrinters');

  static Future<PrinterScan> _scan(String method) async {
    try {
      final raw = await _channel.invokeMapMethod<Object?, Object?>(method);
      if (raw == null) {
        return const PrinterScan(printers: [], needsPermission: false);
      }
      final printers = <PrinterDevice>[];
      final rows = raw['printers'];
      if (rows is List) {
        for (final row in rows) {
          if (row is! Map) continue;
          final kindName = row['kind'] as String? ?? 'bluetooth';
          printers.add(
            PrinterDevice(
              id: row['id'] as String? ?? '',
              name: row['name'] as String? ?? 'Impresora',
              kind: switch (kindName) {
                'usb' => PrinterKind.usb,
                'network' => PrinterKind.network,
                _ => PrinterKind.bluetooth,
              },
            ),
          );
        }
      }
      return PrinterScan(
        printers: printers,
        needsPermission: raw['needsPermission'] == true,
        message: raw['message'] as String?,
      );
    } on PlatformException catch (error) {
      return PrinterScan(
        printers: const [],
        needsPermission: false,
        message: error.message ?? 'No se pudo leer las impresoras del equipo.',
      );
    } on MissingPluginException {
      return const PrinterScan(
        printers: [],
        needsPermission: false,
        message: 'La búsqueda nativa no está disponible en esta sesión.',
      );
    }
  }
}
