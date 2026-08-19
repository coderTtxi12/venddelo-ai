import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:smooth_sheets/smooth_sheets.dart';

import '../formatters.dart';
import '../maps/contact_links.dart';
import '../maps/geo.dart';
import '../maps/google_routes.dart';
import '../maps/monitor_map_style.dart';
import '../maps/nav_target.dart';
import '../maps/open_external_maps.dart';
import '../maps/selected_route_store.dart';
import '../models.dart';
import '../rider_controller.dart';
import '../theme/app_colors.dart';
import '../widgets/rider_live_map.dart';
import '../widgets/rider_profile_menu.dart';
import '../widgets/rider_slide_to_confirm.dart';
import '../widgets/rider_widgets.dart';
import 'account_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.controller,
    required this.onSignOut,
  });

  final RiderController controller;
  final VoidCallback onSignOut;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final RiderMapController _mapController = RiderMapController();
  final SheetController _sheetController = SheetController();
  bool _followRider = true;
  bool _driveView = false;
  bool _overview = false;
  RiderRouteResult? _routes;
  int _selectedRoute = 0;
  String? _routeQueryKey;
  DateTime? _lastRerouteAt;
  BitmapDescriptor? _restaurantIcon;
  BitmapDescriptor? _dropoffIcon;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onControllerTick);
    unawaited(widget.controller.startLiveLocation());
    unawaited(_restoreSelectedRoute());
    unawaited(_loadMapPins());
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onControllerTick);
    _sheetController.dispose();
    super.dispose();
  }

  RiderJobSplit get _jobs {
    final position = widget.controller.currentPosition;
    return splitRiderJobs(
      widget.controller.profile?.assignments ?? const [],
      riderLat: position?.latitude,
      riderLng: position?.longitude,
      itinerary: widget.controller.profile?.itinerary,
    );
  }

  List<PersistedItineraryStop> get _persistedItinerary =>
      widget.controller.profile?.itinerary ?? const [];

  RiderAssignment? get _currentJob => _jobs.current;

  LatLng? get _destination {
    return navigationTargetForJobs(
      _currentJob,
      itinerary: _persistedItinerary,
      assignments: widget.controller.profile?.assignments ?? const [],
    );
  }

  String? get _currentRouteJobKey {
    final job = _currentJob;
    if (job == null) {
      return null;
    }
    return SelectedRouteStore.jobKey(job.id, job.status);
  }

  Future<void> _restoreSelectedRoute() async {
    final jobKey = _currentRouteJobKey;
    if (jobKey == null) {
      return;
    }
    final index = await selectedRouteStore.load(jobKey);
    if (!mounted) {
      return;
    }
    setState(() {
      _selectedRoute = index;
    });
  }

  Future<void> _loadMapPins() async {
    final pixelRatio =
        WidgetsBinding.instance.platformDispatcher.views.first.devicePixelRatio;
    final restaurantIcon = await buildRestaurantMapPin(pixelRatio);
    final dropoffIcon = await buildDropoffMapPin(pixelRatio);
    if (!mounted) {
      return;
    }
    setState(() {
      _restaurantIcon = restaurantIcon;
      _dropoffIcon = dropoffIcon;
    });
  }

  Set<Marker> _stackedMarkers(RiderJobSplit jobs) {
    final position = widget.controller.currentPosition;
    final pins = stackedJobPins(
      jobs,
      riderLat: position?.latitude,
      riderLng: position?.longitude,
      itinerary: _persistedItinerary,
    );
    return {
      for (var index = 0; index < pins.length; index++)
        Marker(
          markerId: MarkerId('job-pin-$index'),
          position: pins[index].position,
          anchor: MonitorMapStyle.pinAnchor,
          zIndexInt: pins[index].current ? 3 : 2,
          infoWindow: InfoWindow(
            title: pins[index].label,
          ),
          icon: pins[index].kind == 'restaurant'
              ? _restaurantIcon ??
                    BitmapDescriptor.defaultMarkerWithHue(
                      BitmapDescriptor.hueViolet,
                    )
              : _dropoffIcon ??
                    BitmapDescriptor.defaultMarkerWithHue(
                      BitmapDescriptor.hueOrange,
                    ),
        ),
    };
  }

  void _selectRoute(int index) {
    setState(() => _selectedRoute = index);
    final jobKey = _currentRouteJobKey;
    if (jobKey != null) {
      unawaited(selectedRouteStore.save(jobKey, index));
    }
  }

  void _onControllerTick() {
    final position = widget.controller.currentPosition;
    if (!mounted) {
      return;
    }
    unawaited(_syncRoutes());
    if (position != null && _followRider && !_overview) {
      if (_driveView) {
        unawaited(_moveDriveCamera());
      } else {
        unawaited(_mapController.moveTo(latLngFromPosition(position)));
      }
    }
    setState(() {});
  }

  Future<void> _syncRoutes() async {
    final job = _currentJob;
    final position = widget.controller.currentPosition;
    final destination = _destination;
    if (job == null || position == null || destination == null) {
      if (_routes != null || _driveView) {
        setState(() {
          _routes = null;
          _selectedRoute = 0;
          _routeQueryKey = null;
          _driveView = false;
          _overview = false;
          _lastRerouteAt = null;
        });
      }
      return;
    }
    final origin = latLngFromPosition(position);
    final jobKey = SelectedRouteStore.jobKey(job.id, job.status);
    final queryKey =
        '$jobKey-${_quantize(origin.latitude)},${_quantize(origin.longitude)}-'
        '${_quantize(destination.latitude)},${_quantize(destination.longitude)}';
    final selected = _selectedRouteOption;
    final offRoute = selected != null && isOffRoute(origin, selected.points);
    if (queryKey == _routeQueryKey && !offRoute) {
      return;
    }
    if (offRoute) {
      final now = DateTime.now();
      final recentlyRerouted =
          _lastRerouteAt != null &&
          now.difference(_lastRerouteAt!) < const Duration(seconds: 12);
      if (queryKey == _routeQueryKey && recentlyRerouted) {
        return;
      }
      _lastRerouteAt = now;
      invalidateRiderRouteCache();
    }
    _routeQueryKey = queryKey;
    await selectedRouteStore.load(jobKey);
    final result = await fetchRiderRoutes(origin: origin, destination: destination);
    if (!mounted || queryKey != _routeQueryKey) {
      return;
    }
    final nextIndex = clampSelectedRoute(
      selectedRouteStore.peek(jobKey),
      result?.routes.length ?? 0,
    );
    setState(() {
      _routes = result;
      _selectedRoute = nextIndex;
    });
  }

  void _recenter() {
    final position = widget.controller.currentPosition;
    setState(() {
      _followRider = true;
      _overview = false;
    });
    if (position == null) {
      return;
    }
    if (_driveView) {
      unawaited(_moveDriveCamera());
      return;
    }
    unawaited(_mapController.moveTo(latLngFromPosition(position), zoom: 16));
  }

  void _lookNorth() {
    final position = widget.controller.currentPosition;
    if (position == null) {
      return;
    }
    setState(() {
      _followRider = false;
      _driveView = false;
      _overview = false;
    });
    unawaited(
      _mapController.lookNorth(target: latLngFromPosition(position), zoom: 16),
    );
  }

  void _toggleDriveView() {
    final enabling = !_driveView;
    setState(() {
      _driveView = enabling;
      _overview = false;
      if (enabling) {
        _followRider = true;
      }
    });
    if (enabling) {
      unawaited(_moveDriveCamera());
    }
  }

  Future<void> _moveDriveCamera() async {
    final position = widget.controller.currentPosition;
    if (position == null) {
      return;
    }
    final origin = latLngFromPosition(position);
    final destination = _destination;
    final selected = _selectedRouteOption;
    final lookAt = selected == null
        ? destination
        : lookAheadOnPath(origin, selected.points) ?? destination;
    final heading = _headingDegrees(position.heading);
    final bearing = lookAt == null ? heading : bearingDegrees(origin, lookAt);
    await _mapController.moveNavigation(
      target: origin,
      bearing: bearing,
      tilt: 60,
      zoom: 18,
    );
  }

  Future<void> _openProfileMenu() {
    return showRiderProfileMenu(
      context: context,
      name: widget.controller.profile == null
          ? 'Repartidor'
          : '${widget.controller.profile!.firstName} ${widget.controller.profile!.lastName}'
              .trim(),
      isOnline: widget.controller.profile?.isOnline ?? false,
      creditAvailableCents: widget.controller.profile?.creditAvailableCents,
      onOpenAccount: () {
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => AccountScreen(controller: widget.controller),
          ),
        );
      },
      onSignOut: widget.onSignOut,
    );
  }

  void _toggleOverview() {
    final position = widget.controller.currentPosition;
    final selected = _selectedRouteOption;
    setState(() {
      _overview = !_overview;
      _followRider = !_overview;
      if (_overview) {
        _driveView = false;
      }
    });
    if (_overview && selected != null) {
      unawaited(_mapController.fitTo(selected.points, animate: true));
      return;
    }
    if (position != null) {
      unawaited(_mapController.moveTo(latLngFromPosition(position), zoom: 16));
    }
  }

  RiderRouteOption? get _selectedRouteOption {
    final routes = _routes?.routes ?? const <RiderRouteOption>[];
    if (routes.isEmpty) return null;
    final index = _selectedRoute.clamp(0, routes.length - 1);
    return routes[index];
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final profile = controller.profile;
    final name = profile == null
        ? 'Repartidor'
        : '${profile.firstName} ${profile.lastName}'.trim();
    final jobs = _jobs;
    final isOnline = profile?.isOnline ?? false;
    final position = controller.currentPosition;
    final center = position == null
        ? kDefaultMapCenter
        : latLngFromPosition(position);

    final job = jobs.current;
    final destination = _destination;
    final selectedRoute = _selectedRouteOption;
    final extraMarkers = _stackedMarkers(jobs);
    final polylines = <Polyline>{};
    final routes = _routes?.routes ?? const <RiderRouteOption>[];
    for (var i = 0; i < routes.length; i++) {
      final option = routes[i];
      final selected = i == _selectedRoute;
      polylines.add(
        Polyline(
          polylineId: PolylineId(option.id),
          points: option.points,
          color: selected ? AppColors.ctaBright : const Color(0xFF94A3B8),
          width: selected ? 6 : 4,
          zIndex: selected ? 2 : 1,
          consumeTapEvents: true,
          onTap: () {
            _selectRoute(i);
          },
        ),
      );
    }

    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final peekHeight = (job == null ? 118.0 : 92.0) + bottomInset;
    final expandedHeight = math.min(
      MediaQuery.sizeOf(context).height * 0.72,
      640.0,
    ).clamp(peekHeight + 160, MediaQuery.sizeOf(context).height * 0.9);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Stack(
        children: [
          Positioned.fill(
            child: RiderLiveMap(
              mapController: _mapController,
              center: center,
              isOnline: isOnline,
              padding: EdgeInsets.only(bottom: peekHeight),
              hideNativeMarker: _followRider,
              extraMarkers: extraMarkers,
              polylines: polylines,
              onUserGesture: () {
                if (_followRider || _driveView) {
                  setState(() {
                    _followRider = false;
                    _driveView = false;
                    _overview = false;
                  });
                }
              },
            ),
          ),
          if (_followRider)
            Positioned(
              left: 0,
              right: 0,
              top: 0,
              bottom: peekHeight,
              child: IgnorePointer(
                child: Center(child: RiderLocationMarker(isOnline: isOnline)),
              ),
            ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _TopStatusChip(name: name, isOnline: isOnline),
                      ),
                      const SizedBox(width: 10),
                      _ProfileIconButton(
                        name: name,
                        onPressed: () => unawaited(_openProfileMenu()),
                      ),
                    ],
                  ),
                  if (profile != null) ...[
                    const SizedBox(height: 8),
                    _CreditChip(availableCents: profile.creditAvailableCents),
                  ],
                ],
              ),
            ),
          ),
          if (routes.length > 1)
            Positioned(
              left: 16,
              right: 64,
              bottom: peekHeight + 12,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.only(right: 8),
                child: Row(
                  children: [
                    for (var i = 0; i < routes.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: _RouteChip(
                          label: routes[i].label ?? 'Ruta ${i + 1}',
                          detail: '${routes[i].etaLabel} · ${routes[i].distanceLabel}',
                          selected: i == _selectedRoute,
                          onTap: () => _selectRoute(i),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          Positioned(
            right: 16,
            bottom: peekHeight + 12,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _RoundIconButton(
                  icon: Icons.explore_rounded,
                  tooltip: 'Norte arriba',
                  onPressed: _lookNorth,
                ),
                const SizedBox(height: 12),
                _RoundIconButton(
                  icon: Icons.navigation_rounded,
                  tooltip: 'Vista de conducción',
                  highlighted: _driveView,
                  onPressed: _toggleDriveView,
                ),
                const SizedBox(height: 12),
                _RoundIconButton(
                  icon: _overview
                      ? Icons.near_me_rounded
                      : Icons.threed_rotation_rounded,
                  tooltip: _overview ? 'Salir de vista completa' : 'Ver toda la ruta',
                  highlighted: _overview,
                  onPressed: selectedRoute == null && destination == null
                      ? _recenter
                      : _toggleOverview,
                ),
                const SizedBox(height: 12),
                _RoundIconButton(
                  icon: Icons.my_location_rounded,
                  tooltip: 'Centrar mapa',
                  highlighted: _followRider,
                  onPressed: _recenter,
                ),
              ],
            ),
          ),
          SheetViewport(
            child: _HomeBottomSheet(
              controller: controller,
              sheetController: _sheetController,
              jobs: jobs,
              itinerary: _persistedItinerary,
              isOnline: isOnline,
              peekHeight: peekHeight,
              expandedHeight: expandedHeight,
            ),
          ),
        ],
      ),
    );
  }
}

class _TopStatusChip extends StatelessWidget {
  const _TopStatusChip({required this.name, required this.isOnline});

  final String name;
  final bool isOnline;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(999),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A000000),
            blurRadius: 16,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: isOnline ? AppColors.online : AppColors.offline,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleSmall,
            ),
          ),
          Text(
            isOnline ? 'En línea' : 'Fuera',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: isOnline ? AppColors.online : AppColors.textMuted,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _CreditChip extends StatelessWidget {
  const _CreditChip({required this.availableCents});

  final int availableCents;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Crédito disponible ${formatMoneyCents(availableCents)}',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(999),
          boxShadow: const [
            BoxShadow(
              color: Color(0x1A000000),
              blurRadius: 16,
              offset: Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.account_balance_wallet_rounded,
              size: 18,
              color: AppColors.textPrimary,
            ),
            const SizedBox(width: 8),
            Text(
              'Crédito ${formatMoneyCents(availableCents)}',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileIconButton extends StatelessWidget {
  const _ProfileIconButton({
    required this.name,
    required this.onPressed,
  });

  final String name;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isEmpty
        ? 'R'
        : name.trim().characters.first.toUpperCase();
    return Semantics(
      button: true,
      label: 'Perfil',
      child: Material(
        color: AppColors.surface,
        shape: const CircleBorder(),
        elevation: 3,
        shadowColor: const Color(0x33000000),
        child: InkWell(
          onTap: onPressed,
          customBorder: const CircleBorder(),
          child: Ink(
            width: 52,
            height: 52,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                initial,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.cta,
                    ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({
    required this.icon,
    required this.onPressed,
    required this.tooltip,
    this.highlighted = false,
  });

  static const double _size = 64;

  final IconData icon;
  final VoidCallback onPressed;
  final String tooltip;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      shape: const CircleBorder(),
      elevation: 3,
      shadowColor: const Color(0x33000000),
      child: IconButton(
        tooltip: tooltip,
        onPressed: onPressed,
        iconSize: _size * 0.48,
        padding: EdgeInsets.zero,
        visualDensity: VisualDensity.standard,
        constraints: BoxConstraints.tightFor(width: _size, height: _size),
        color: highlighted ? AppColors.cta : AppColors.textPrimary,
        icon: Icon(icon),
      ),
    );
  }
}

class _RouteChip extends StatelessWidget {
  const _RouteChip({
    required this.label,
    required this.detail,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String detail;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.cta : AppColors.surface,
      borderRadius: BorderRadius.circular(999),
      elevation: 3,
      shadowColor: const Color(0x33000000),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: selected ? Colors.white : AppColors.textPrimary,
                  fontSize: 15,
                ),
              ),
              Text(
                detail,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: selected ? Colors.white : AppColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeBottomSheet extends StatelessWidget {
  const _HomeBottomSheet({
    required this.controller,
    required this.sheetController,
    required this.jobs,
    required this.itinerary,
    required this.isOnline,
    required this.peekHeight,
    required this.expandedHeight,
  });

  final RiderController controller;
  final SheetController sheetController;
  final RiderJobSplit jobs;
  final List<PersistedItineraryStop> itinerary;
  final bool isOnline;
  final double peekHeight;
  final double expandedHeight;

  void _expandIfPeeked() {
    final current = sheetController.value ?? peekHeight;
    if (current <= peekHeight + 28) {
      unawaited(sheetController.animateTo(SheetOffset.absolute(expandedHeight)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = jobs.current;
    final peekTitle = job == null
        ? (isOnline ? 'En línea' : 'Fuera de línea')
        : jobStepLabel(job.status);
    final peekSubtitle = job == null ? 'Toca para ver opciones' : null;

    return Sheet(
      controller: sheetController,
      initialOffset: SheetOffset.absolute(peekHeight),
      physics: const BouncingSheetPhysics(),
      snapGrid: SheetSnapGrid(
        snaps: [
          SheetOffset.absolute(peekHeight),
          SheetOffset.absolute(expandedHeight),
        ],
      ),
      decoration: const MaterialSheetDecoration(
        size: SheetSize.stretch,
        color: AppColors.surface,
        elevation: 12,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),
      child: SizedBox(
        height: expandedHeight,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: _expandIfPeeked,
                child: Semantics(
                  button: true,
                  label: 'Mostrar detalles. $peekTitle${peekSubtitle == null ? '' : '. $peekSubtitle'}',
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Center(
                          child: Container(
                            width: 40,
                            height: 4,
                            margin: const EdgeInsets.only(bottom: 12),
                            decoration: BoxDecoration(
                              color: AppColors.border,
                              borderRadius: BorderRadius.circular(99),
                            ),
                          ),
                        ),
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    peekTitle,
                                    style: Theme.of(context).textTheme.titleMedium,
                                  ),
                                  if (peekSubtitle != null) ...[
                                    const SizedBox(height: 2),
                                    Text(
                                      peekSubtitle,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context).textTheme.bodyMedium
                                          ?.copyWith(color: AppColors.textMuted),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            const Icon(
                              Icons.keyboard_arrow_up_rounded,
                              color: AppColors.textMuted,
                              size: 28,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                children: [
                  if (controller.showIosKillWarning) ...[
                    const RiderInfoBanner(
                      message:
                          'Si cierras la app deslizándola hacia arriba, el GPS se detiene y no recibirás ofertas.',
                    ),
                    const SizedBox(height: 10),
                  ],
                  if (controller.errorMessage != null) ...[
                    RiderErrorBanner(message: controller.errorMessage!),
                    const SizedBox(height: 10),
                  ],
                  if (controller.needsLocationSettings) ...[
                    TextButton(
                      onPressed: controller.openLocationSettings,
                      child: const Text('Abrir ajustes de ubicación'),
                    ),
                    const SizedBox(height: 6),
                  ],
                  if (job == null)
                    Text(
                      isOnline
                          ? 'Te avisaremos cuando llegue una oferta cercana.'
                          : 'Ponte en línea para recibir envíos cerca de ti.',
                      style: Theme.of(context).textTheme.bodyLarge
                          ?.copyWith(color: AppColors.textSecondary),
                    )
                  else
                    _JobCard(assignment: job),
                  if (job != null) ...[
                    const SizedBox(height: 14),
                    _RouteFlow(
                      stops: riderItineraryStops(
                        jobs,
                        riderLat: controller.currentPosition?.latitude,
                        riderLng: controller.currentPosition?.longitude,
                        itinerary: itinerary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                4,
                20,
                math.max(12, MediaQuery.paddingOf(context).bottom),
              ),
              child: job == null
                  ? RiderSlideToConfirm(
                      key: ValueKey(isOnline),
                      label: isOnline
                          ? 'Desliza para salir de línea'
                          : 'Desliza para ponerte en línea',
                      color: isOnline ? AppColors.primary : AppColors.cta,
                      busy: controller.onlineBusy,
                      onConfirmed: controller.onlineBusy
                          ? null
                          : () => controller.setOnline(!isOnline),
                    )
                  : RiderSlideToConfirm(
                      key: ValueKey('${job.id}-${job.status}'),
                      label: jobSlideLabel(job.status),
                      color: AppColors.cta,
                      onConfirmed: jobAction(job.status) == null
                          ? null
                          : () => controller.transitionAssignment(
                              job.id,
                              jobAction(job.status)!,
                            ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

double _headingDegrees(double heading) {
  if (heading.isNaN || heading < 0) {
    return 0;
  }
  return heading;
}

double _quantize(double value) => (value * 1000).round() / 1000;

class _RouteFlow extends StatelessWidget {
  const _RouteFlow({required this.stops});

  final List<RiderItineraryStop> stops;

  @override
  Widget build(BuildContext context) {
    if (stops.isEmpty) {
      return const SizedBox.shrink();
    }
    return Semantics(
      label: 'Ruta prevista, ${stops.length} paradas. Ahora: ${stops.first.action} ${stops.first.title}',
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Tu ruta',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: 0.4,
                color: AppColors.cta,
              ),
            ),
            Text(
              'Te guiamos al paso actual. El resto es la ruta prevista.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 10),
            for (var index = 0; index < stops.length; index++) ...[
              if (index > 0) const SizedBox(height: 8),
              _RouteFlowStep(stop: stops[index]),
            ],
          ],
        ),
      ),
    );
  }
}

class _RouteFlowStep extends StatelessWidget {
  const _RouteFlowStep({required this.stop});

  final RiderItineraryStop stop;

  @override
  Widget build(BuildContext context) {
    final now = stop.current;
    final badgeColor = now ? AppColors.cta : const Color(0xFFEA580C);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 24,
          height: 24,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: badgeColor,
            shape: BoxShape.circle,
          ),
          child: Text(
            '${stop.sequence}',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                now ? 'Ahora · ${stop.action}' : stop.action,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: badgeColor,
                  letterSpacing: 0.2,
                ),
              ),
              Text(
                stop.title,
                style: Theme.of(context).textTheme.titleSmall,
              ),
              if (stop.detail != null &&
                  stop.detail!.trim().isNotEmpty &&
                  stop.detail != stop.title)
                Text(
                  stop.detail!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.textMuted,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.assignment});

  final RiderAssignment assignment;

  @override
  Widget build(BuildContext context) {
    final goingToRestaurant = assignment.status == 'assigned';
    final address = jobDestinationAddress(assignment);
    final notes = assignment.notes?.trim() ?? '';
    final restaurantLat = assignment.restaurantLat;
    final restaurantLng = assignment.restaurantLng;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (formatShortId(assignment.shortId).isNotEmpty) ...[
          Text(
            formatShortId(assignment.shortId),
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 10),
        ],
        _DestinationMapsCard(
          title: goingToRestaurant ? assignment.restaurantName : 'Entrega',
          address: address,
          leadingIcon: goingToRestaurant
              ? Icons.storefront_rounded
              : Icons.flag_rounded,
          onOpenMaps: () => unawaited(
            openExternalMaps(
              label: goingToRestaurant
                  ? assignment.restaurantName
                  : assignment.dropoffAddress,
              latitude: goingToRestaurant
                  ? restaurantLat
                  : assignment.dropoffLat,
              longitude: goingToRestaurant
                  ? restaurantLng
                  : assignment.dropoffLng,
              address: goingToRestaurant
                  ? assignment.restaurantAddress
                  : assignment.dropoffAddress,
            ),
          ),
        ),
        if (!goingToRestaurant) ...[
          const SizedBox(height: 14),
          _CustomerContactCard(
            name: assignment.customerName,
            phone: assignment.customerPhone,
          ),
        ],
        const SizedBox(height: 14),
        _JobDetails(assignment: assignment),
        if (notes.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Notas del negocio',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppColors.textMuted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  notes,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _JobDetails extends StatelessWidget {
  const _JobDetails({required this.assignment});

  final RiderAssignment assignment;

  @override
  Widget build(BuildContext context) {
    final collect = assignment.collectCents;
    final denomination = assignment.cashDenominationCents;
    final fee = assignment.quotedFeeCents;
    final payment = assignment.paymentMethod;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          if (payment.isNotEmpty)
            RiderMetaRow(label: 'Pago', value: paymentLabel(payment)),
          if (collect != null && collect > 0)
            RiderMetaRow(label: 'Cobrar', value: formatMoneyCents(collect)),
          if (payment == 'cash' && denomination != null)
            RiderMetaRow(
              label: 'Pagará con',
              value: formatMoneyCents(denomination),
            ),
          if (fee != null && fee > 0)
            RiderMetaRow(label: 'Envío', value: formatMoneyCents(fee)),
          RiderMetaRow(
            label: 'Paquetes',
            value:
                '${packageCountLabel(assignment.packageCount)} · ${packageSizeLabel(assignment.packageSize)}',
          ),
        ],
      ),
    );
  }
}

class _CustomerContactCard extends StatelessWidget {
  const _CustomerContactCard({this.name, this.phone});

  final String? name;
  final String? phone;

  @override
  Widget build(BuildContext context) {
    final displayName = name?.trim() ?? '';
    final displayPhone = phone?.trim() ?? '';
    if (displayName.isEmpty && displayPhone.isEmpty) {
      return const SizedBox.shrink();
    }
    final canCall = phoneDigits(displayPhone).isNotEmpty;

    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Cliente',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              displayName.isEmpty ? 'Sin nombre' : displayName,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (canCall) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _ContactActionButton(
                      label: 'Llamar',
                      icon: Icons.call_rounded,
                      background: AppColors.cta,
                      onPressed: () => unawaited(openPhoneCall(displayPhone)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _ContactActionButton(
                      label: 'WhatsApp',
                      icon: Icons.chat_rounded,
                      background: const Color(0xFF128C7E),
                      onPressed: () => unawaited(openWhatsApp(displayPhone)),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ContactActionButton extends StatelessWidget {
  const _ContactActionButton({
    required this.label,
    required this.icon,
    required this.background,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final Color background;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: background,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 64),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, color: Colors.white, size: 26),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DestinationMapsCard extends StatefulWidget {
  const _DestinationMapsCard({
    required this.title,
    required this.address,
    required this.leadingIcon,
    required this.onOpenMaps,
  });

  final String title;
  final String address;
  final IconData leadingIcon;
  final VoidCallback onOpenMaps;

  @override
  State<_DestinationMapsCard> createState() => _DestinationMapsCardState();
}

class _DestinationMapsCardState extends State<_DestinationMapsCard> {
  var _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: widget.onOpenMaps,
              child: Semantics(
                button: true,
                label: 'Abrir Google Maps. ${widget.title}. ${widget.address}',
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 14, 6, 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: AppColors.cta.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(
                          widget.leadingIcon,
                          color: AppColors.cta,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.title,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              widget.address,
                              maxLines: _expanded ? null : 2,
                              overflow: _expanded
                                  ? TextOverflow.visible
                                  : TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: _expanded
                            ? 'Contraer dirección'
                            : 'Mostrar dirección completa',
                        onPressed: () =>
                            setState(() => _expanded = !_expanded),
                        icon: Icon(
                          _expanded
                              ? Icons.expand_less_rounded
                              : Icons.expand_more_rounded,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const Divider(height: 1),
          Material(
            color: AppColors.cta.withValues(alpha: 0.06),
            child: InkWell(
              onTap: widget.onOpenMaps,
              child: Semantics(
                button: true,
                label: 'Cómo llegar en Google Maps',
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 64),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.near_me_rounded,
                          color: AppColors.cta,
                          size: 28,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Cómo llegar',
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(color: AppColors.cta),
                          ),
                        ),
                        const Icon(
                          Icons.arrow_outward_rounded,
                          color: AppColors.cta,
                          size: 24,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
