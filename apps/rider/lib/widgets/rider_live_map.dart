import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart' show Factory;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../theme/app_colors.dart';

const LatLng kDefaultMapCenter = LatLng(19.4326, -99.1332);

LatLng latLngFromPosition(Position position) {
  return LatLng(position.latitude, position.longitude);
}

class RiderMapController {
  GoogleMapController? _map;
  var _programmaticMove = false;

  bool get isProgrammaticMove => _programmaticMove;

  void attach(GoogleMapController controller) {
    _map = controller;
  }

  Future<void> moveTo(LatLng target, {double? zoom}) async {
    final map = _map;
    if (map == null) {
      return;
    }
    _programmaticMove = true;
    try {
      await map.animateCamera(
        zoom == null
            ? CameraUpdate.newLatLng(target)
            : CameraUpdate.newLatLngZoom(target, zoom),
      );
    } finally {
      await Future<void>.delayed(const Duration(milliseconds: 280));
      _programmaticMove = false;
    }
  }

  Future<void> moveNavigation({
    required LatLng target,
    required double bearing,
    double tilt = 52,
    double zoom = 17.2,
  }) async {
    final map = _map;
    if (map == null) {
      return;
    }
    _programmaticMove = true;
    try {
      await map.animateCamera(
        CameraUpdate.newCameraPosition(
          CameraPosition(
            target: target,
            bearing: bearing,
            tilt: tilt,
            zoom: zoom,
          ),
        ),
      );
    } finally {
      await Future<void>.delayed(const Duration(milliseconds: 280));
      _programmaticMove = false;
    }
  }

  Future<void> lookNorth({required LatLng target, double zoom = 15}) async {
    await moveNavigation(target: target, bearing: 0, tilt: 0, zoom: zoom);
  }

  Future<void> lookOverview({
    required LatLng target,
    double bearing = 0,
    double tilt = 45,
    double zoom = 15.4,
  }) async {
    await moveNavigation(
      target: target,
      bearing: bearing,
      tilt: tilt,
      zoom: zoom,
    );
  }

  Future<void> fitTo(Iterable<LatLng> points, {bool animate = false}) async {
    final map = _map;
    final list = points.toList();
    if (map == null || list.isEmpty) {
      return;
    }
    _programmaticMove = true;
    try {
      final update = _cameraUpdateFor(list);
      if (animate) {
        await map.animateCamera(update);
      } else {
        await map.moveCamera(update);
      }
    } catch (_) {
      if (list.isNotEmpty) {
        await map.moveCamera(CameraUpdate.newLatLngZoom(list.first, 14));
      }
    } finally {
      await Future<void>.delayed(const Duration(milliseconds: 160));
      _programmaticMove = false;
    }
  }
}

CameraUpdate _cameraUpdateFor(List<LatLng> list) {
  if (list.length == 1) {
    return CameraUpdate.newLatLngZoom(list.first, 15);
  }
  var minLat = list.first.latitude;
  var maxLat = minLat;
  var minLng = list.first.longitude;
  var maxLng = minLng;
  for (final point in list.skip(1)) {
    minLat = math.min(minLat, point.latitude);
    maxLat = math.max(maxLat, point.latitude);
    minLng = math.min(minLng, point.longitude);
    maxLng = math.max(maxLng, point.longitude);
  }
  if ((maxLat - minLat).abs() < 0.002) {
    minLat -= 0.003;
    maxLat += 0.003;
  }
  if ((maxLng - minLng).abs() < 0.002) {
    minLng -= 0.003;
    maxLng += 0.003;
  }
  return CameraUpdate.newLatLngBounds(
    LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    ),
    48,
  );
}

class RiderLiveMap extends StatefulWidget {
  const RiderLiveMap({
    super.key,
    required this.mapController,
    required this.center,
    required this.isOnline,
    required this.padding,
    required this.hideNativeMarker,
    required this.onUserGesture,
    this.extraMarkers = const {},
    this.polylines = const {},
    this.fitPoints = const [],
    this.fitOnce = false,
    this.minZoom = 5,
    this.mapKey,
  });

  final RiderMapController mapController;
  final LatLng center;
  final bool isOnline;
  final EdgeInsets padding;
  final bool hideNativeMarker;
  final VoidCallback onUserGesture;
  final Set<Marker> extraMarkers;
  final Set<Polyline> polylines;
  final List<LatLng> fitPoints;
  final bool fitOnce;
  final double minZoom;
  final Key? mapKey;

  @override
  State<RiderLiveMap> createState() => _RiderLiveMapState();
}

class _RiderLiveMapState extends State<RiderLiveMap> {
  BitmapDescriptor? _markerIcon;
  Color? _markerColor;
  var _didFit = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    unawaited(_syncMarkerIcon());
  }

  @override
  void didUpdateWidget(covariant RiderLiveMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isOnline != widget.isOnline) {
      unawaited(_syncMarkerIcon());
    }
    if (widget.fitOnce && _didFit) {
      return;
    }
    if (!_samePoints(oldWidget.fitPoints, widget.fitPoints) &&
        widget.fitPoints.isNotEmpty) {
      unawaited(_fitRoute());
    }
  }

  Future<void> _syncMarkerIcon() async {
    final color = widget.isOnline ? AppColors.online : AppColors.accent;
    if (_markerColor == color && _markerIcon != null) {
      return;
    }
    final pixelRatio = MediaQuery.maybeDevicePixelRatioOf(context) ?? 3;
    final icon = await _buildRiderMarker(color: color, pixelRatio: pixelRatio);
    if (!mounted) {
      return;
    }
    setState(() {
      _markerIcon = icon;
      _markerColor = color;
    });
  }

  Future<void> _fitRoute() async {
    if (widget.fitPoints.isEmpty) {
      return;
    }
    await widget.mapController.fitTo(widget.fitPoints);
    _didFit = true;
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.background,
      child: GoogleMap(
        key: widget.mapKey ?? const ValueKey('rider-google-map'),
        initialCameraPosition: CameraPosition(
          target: widget.fitPoints.isNotEmpty
              ? widget.fitPoints.first
              : widget.center,
          zoom: 14,
        ),
        padding: widget.padding,
        myLocationEnabled: false,
        myLocationButtonEnabled: false,
        zoomControlsEnabled: false,
        zoomGesturesEnabled: true,
        scrollGesturesEnabled: true,
        rotateGesturesEnabled: true,
        tiltGesturesEnabled: true,
        compassEnabled: true,
        mapToolbarEnabled: false,
        buildingsEnabled: true,
        trafficEnabled: false,
        liteModeEnabled: false,
        minMaxZoomPreference: MinMaxZoomPreference(widget.minZoom, 20),
        gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
          Factory<EagerGestureRecognizer>(() => EagerGestureRecognizer()),
        },
        markers: {
          Marker(
            markerId: const MarkerId('rider'),
            position: widget.center,
            visible: !widget.hideNativeMarker,
            icon:
                _markerIcon ??
                BitmapDescriptor.defaultMarkerWithHue(
                  widget.isOnline
                      ? BitmapDescriptor.hueGreen
                      : BitmapDescriptor.hueAzure,
                ),
            anchor: const Offset(0.5, 0.5),
            flat: true,
            consumeTapEvents: true,
          ),
          ...widget.extraMarkers,
        },
        polylines: widget.polylines,
        onMapCreated: (controller) {
          widget.mapController.attach(controller);
          WidgetsBinding.instance.addPostFrameCallback((_) {
            unawaited(_fitRoute());
          });
        },
        onCameraMoveStarted: () {
          if (!widget.mapController.isProgrammaticMove) {
            widget.onUserGesture();
          }
        },
      ),
    );
  }
}

bool _samePoints(List<LatLng> left, List<LatLng> right) {
  if (left.length != right.length) {
    return false;
  }
  for (var i = 0; i < left.length; i++) {
    if (left[i].latitude != right[i].latitude ||
        left[i].longitude != right[i].longitude) {
      return false;
    }
  }
  return true;
}

class RiderLocationMarker extends StatelessWidget {
  const RiderLocationMarker({super.key, this.isOnline = false});

  final bool isOnline;

  @override
  Widget build(BuildContext context) {
    final color = isOnline ? AppColors.online : AppColors.accent;
    return SizedBox(
      width: 72,
      height: 72,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.18),
              shape: BoxShape.circle,
            ),
          ),
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 3),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x33000000),
                  blurRadius: 8,
                  offset: Offset(0, 2),
                ),
              ],
            ),
            child: const Icon(
              Icons.navigation_rounded,
              color: Colors.white,
              size: 16,
            ),
          ),
        ],
      ),
    );
  }
}

Future<BitmapDescriptor> _buildRiderMarker({
  required Color color,
  required double pixelRatio,
}) async {
  const logicalSize = 72.0;
  final size = (logicalSize * pixelRatio).round();
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  final center = Offset(size / 2, size / 2);
  final glowRadius = 26 * pixelRatio;
  final coreRadius = 14 * pixelRatio;

  canvas.drawCircle(
    center,
    glowRadius,
    Paint()..color = color.withValues(alpha: 0.22),
  );
  canvas.drawCircle(center, coreRadius, Paint()..color = color);
  canvas.drawCircle(
    center,
    coreRadius,
    Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.2 * pixelRatio,
  );

  final chevron = Path()
    ..moveTo(center.dx, center.dy - 6.5 * pixelRatio)
    ..lineTo(center.dx + 5.2 * pixelRatio, center.dy + 4.8 * pixelRatio)
    ..lineTo(center.dx, center.dy + 1.6 * pixelRatio)
    ..lineTo(center.dx - 5.2 * pixelRatio, center.dy + 4.8 * pixelRatio)
    ..close();
  canvas.drawPath(chevron, Paint()..color = Colors.white);

  final picture = recorder.endRecording();
  final image = await picture.toImage(size, size);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  return BitmapDescriptor.bytes(
    bytes!.buffer.asUint8List(),
    imagePixelRatio: pixelRatio,
  );
}
