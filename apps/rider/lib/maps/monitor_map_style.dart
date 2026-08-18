import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Map language copied from the delivery monitor: purple restaurant square,
/// orange customer dot, orange dashed pending route.
abstract final class MonitorMapStyle {
  static const restaurant = Color(0xFF7C3AED);
  static const dropoff = Color(0xFFF97316);
  static const pendingRoute = Color(0xFFF97316);
  static const pendingRouteWidth = 4;
  static const pinAnchor = Offset(0.5, 0.5);

  static final pendingRoutePatterns = <PatternItem>[
    PatternItem.dash(14),
    PatternItem.gap(10),
  ];
}

Future<BitmapDescriptor> buildRestaurantMapPin(double pixelRatio) {
  return _paintMonitorPin(
    pixelRatio: pixelRatio,
    color: MonitorMapStyle.restaurant,
    square: true,
  );
}

Future<BitmapDescriptor> buildDropoffMapPin(double pixelRatio) {
  return _paintMonitorPin(
    pixelRatio: pixelRatio,
    color: MonitorMapStyle.dropoff,
    square: false,
  );
}

Future<BitmapDescriptor> _paintMonitorPin({
  required double pixelRatio,
  required Color color,
  required bool square,
}) async {
  const logicalSize = 40.0;
  final size = (logicalSize * pixelRatio).round().clamp(24, 160);
  final ratio = size / logicalSize;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  final center = Offset(size / 2, size / 2);
  final pinSize = 22 * ratio;
  final rect = Rect.fromCenter(center: center, width: pinSize, height: pinSize);
  final corner = Radius.circular(6 * ratio);
  final shadow = Paint()
    ..color = const Color(0x330F172A)
    ..maskFilter = MaskFilter.blur(BlurStyle.normal, 2.2 * ratio);
  final fill = Paint()..color = color;
  final stroke = Paint()
    ..color = Colors.white
    ..style = PaintingStyle.stroke
    ..strokeWidth = 2.4 * ratio;

  if (square) {
    final shape = RRect.fromRectAndRadius(rect, corner);
    canvas.drawRRect(shape.shift(Offset(0, 1.2 * ratio)), shadow);
    canvas.drawRRect(shape, fill);
    canvas.drawRRect(shape, stroke);
  } else {
    final radius = pinSize / 2;
    canvas.drawCircle(center.translate(0, 1.2 * ratio), radius, shadow);
    canvas.drawCircle(center, radius, fill);
    canvas.drawCircle(center, radius, stroke);
  }

  final picture = recorder.endRecording();
  final image = await picture.toImage(size, size);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  return BitmapDescriptor.bytes(
    bytes!.buffer.asUint8List(),
    imagePixelRatio: ratio,
  );
}
