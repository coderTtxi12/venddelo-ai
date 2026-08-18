import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:smooth_sheets/smooth_sheets.dart';

import '../maps/google_routes.dart';
import '../maps/monitor_map_style.dart';
import '../models.dart';
import '../theme/app_colors.dart';
import '../widgets/offer_details_sheet.dart';
import '../widgets/rider_live_map.dart';

class OfferScreen extends StatefulWidget {
  const OfferScreen({
    super.key,
    required this.offer,
    required this.onAccept,
    this.errorMessage,
    this.busy = false,
    this.showMap = true,
  });

  final RiderOffer offer;
  final VoidCallback onAccept;
  final String? errorMessage;
  final bool busy;
  final bool showMap;

  @override
  State<OfferScreen> createState() => _OfferScreenState();
}

class _OfferScreenState extends State<OfferScreen> {
  final RiderMapController _mapController = RiderMapController();
  late OfferMapGeometry _geometry;
  BitmapDescriptor? _restaurantIcon;
  BitmapDescriptor? _dropoffIcon;
  List<LatLng>? _roadPoints;

  @override
  void initState() {
    super.initState();
    _geometry = _geometryFor();
    unawaited(_bootstrapMap());
  }

  @override
  void didUpdateWidget(covariant OfferScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.offer.id != widget.offer.id ||
        oldWidget.offer.restaurantLat != widget.offer.restaurantLat ||
        oldWidget.offer.dropoffLat != widget.offer.dropoffLat ||
        oldWidget.offer.stops.length != widget.offer.stops.length) {
      _roadPoints = null;
      _geometry = _geometryFor();
      unawaited(_loadRoadRoute());
    }
  }

  OfferMapGeometry _geometryFor({List<LatLng>? roadPoints}) {
    return offerMapGeometry(
      widget.offer,
      roadPoints: roadPoints ?? _roadPoints,
      restaurantIcon: _restaurantIcon,
      dropoffIcon: _dropoffIcon,
    );
  }

  Future<void> _bootstrapMap() async {
    final pixelRatio =
        WidgetsBinding.instance.platformDispatcher.views.first.devicePixelRatio;
    final restaurantIcon = await buildRestaurantMapPin(pixelRatio);
    final dropoffIcon = await buildDropoffMapPin(pixelRatio);
    if (!mounted) {
      return;
    }
    _restaurantIcon = restaurantIcon;
    _dropoffIcon = dropoffIcon;
    setState(() => _geometry = _geometryFor());
    await _loadRoadRoute();
  }

  Future<void> _loadRoadRoute() async {
    final origin = _latLng(widget.offer.restaurantLat, widget.offer.restaurantLng);
    final destination = _latLng(widget.offer.dropoffLat, widget.offer.dropoffLng);
    if (origin == null || destination == null) {
      return;
    }
    final result = await fetchRiderRoutes(origin: origin, destination: destination);
    if (!mounted || result == null || result.routes.isEmpty) {
      return;
    }
    _roadPoints = result.routes.first.points;
    setState(() => _geometry = _geometryFor());
  }

  @override
  Widget build(BuildContext context) {
    final center = _geometry.fitPoints.isEmpty
        ? kDefaultMapCenter
        : _geometry.fitPoints.first;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: LayoutBuilder(
        builder: (context, constraints) {
          return Stack(
            children: [
              if (widget.showMap)
                Positioned.fill(
                  child: RepaintBoundary(
                    child: RiderLiveMap(
                      mapKey: const ValueKey('offer-google-map'),
                      mapController: _mapController,
                      center: center,
                      isOnline: true,
                      padding: const EdgeInsets.only(bottom: 280),
                      hideNativeMarker: true,
                      extraMarkers: _geometry.markers,
                      polylines: _geometry.polylines,
                      fitPoints: _geometry.fitPoints,
                      fitOnce: true,
                      onUserGesture: () {},
                    ),
                  ),
                )
              else
                const Positioned.fill(
                  child: ColoredBox(color: AppColors.background),
                ),
              SheetViewport(
                child: Sheet(
                  initialOffset: const SheetOffset(0.5),
                  physics: const BouncingSheetPhysics(),
                  snapGrid: SheetSnapGrid(
                    snaps: [
                      SheetOffset.absolute(360),
                      SheetOffset.absolute(constraints.maxHeight * 0.5),
                      SheetOffset.absolute(constraints.maxHeight * 0.92),
                    ],
                  ),
                  scrollConfiguration: const SheetScrollConfiguration(),
                  decoration: const MaterialSheetDecoration(
                    size: SheetSize.fit,
                    color: AppColors.surface,
                    elevation: 12,
                    clipBehavior: Clip.antiAlias,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.vertical(
                        top: Radius.circular(28),
                      ),
                    ),
                  ),
                  child: SizedBox(
                    height: constraints.maxHeight,
                    child: OfferDetailsSheet(
                      offer: widget.offer,
                      errorMessage: widget.errorMessage,
                      busy: widget.busy,
                      onAccept: widget.onAccept,
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class OfferMapGeometry {
  const OfferMapGeometry({
    required this.markers,
    required this.polylines,
    required this.fitPoints,
  });

  final Set<Marker> markers;
  final Set<Polyline> polylines;
  final List<LatLng> fitPoints;
}

OfferMapGeometry offerMapGeometry(
  RiderOffer offer, {
  List<LatLng>? roadPoints,
  BitmapDescriptor? restaurantIcon,
  BitmapDescriptor? dropoffIcon,
}) {
  final stops = offer.stops.isEmpty
      ? [
          RiderOfferStop(
            restaurantName: offer.restaurantName,
            dropoffAddress: offer.dropoffAddress,
            restaurantLat: offer.restaurantLat,
            restaurantLng: offer.restaurantLng,
            dropoffLat: offer.dropoffLat,
            dropoffLng: offer.dropoffLng,
          ),
        ]
      : offer.stops;

  final markers = <Marker>{};
  final polylines = <Polyline>{};
  final fitPoints = <LatLng>[];

  for (var index = 0; index < stops.length; index++) {
    final stop = stops[index];
    final origin = _latLng(
      stop.restaurantLat ?? offer.restaurantLat,
      stop.restaurantLng ?? offer.restaurantLng,
    );
    final destination = _latLng(
      stop.dropoffLat ?? offer.dropoffLat,
      stop.dropoffLng ?? offer.dropoffLng,
    );
    if (origin != null) {
      fitPoints.add(origin);
      markers.add(
        Marker(
          markerId: MarkerId('origin-$index'),
          position: origin,
          anchor: MonitorMapStyle.pinAnchor,
          zIndex: 2,
          infoWindow: InfoWindow(
            title: 'Recoger',
            snippet: stop.restaurantName,
          ),
          icon: restaurantIcon ??
              BitmapDescriptor.defaultMarkerWithHue(
                BitmapDescriptor.hueViolet,
              ),
        ),
      );
    }
    if (destination != null) {
      fitPoints.add(destination);
      markers.add(
        Marker(
          markerId: MarkerId('dropoff-$index'),
          position: destination,
          anchor: MonitorMapStyle.pinAnchor,
          zIndex: 2,
          infoWindow: InfoWindow(
            title: 'Entregar',
            snippet: stop.dropoffAddress,
          ),
          icon: dropoffIcon ??
              BitmapDescriptor.defaultMarkerWithHue(
                BitmapDescriptor.hueOrange,
              ),
        ),
      );
    }
    final path = (index == 0 && roadPoints != null && roadPoints.length > 1)
        ? roadPoints
        : [
            ?origin,
            ?destination,
          ];
    if (path.length > 1) {
      polylines.add(
        Polyline(
          polylineId: PolylineId('route-$index'),
          points: path,
          color: MonitorMapStyle.pendingRoute,
          width: MonitorMapStyle.pendingRouteWidth,
          geodesic: path.length < 3,
          patterns: MonitorMapStyle.pendingRoutePatterns,
        ),
      );
      if (path.length > 2) {
        fitPoints.addAll(path);
      }
    }
  }

  return OfferMapGeometry(
    markers: markers,
    polylines: polylines,
    fitPoints: fitPoints,
  );
}

LatLng? _latLng(double? lat, double? lng) {
  if (lat == null || lng == null) {
    return null;
  }
  if (lat.abs() < 0.0001 && lng.abs() < 0.0001) {
    return null;
  }
  return LatLng(lat, lng);
}
