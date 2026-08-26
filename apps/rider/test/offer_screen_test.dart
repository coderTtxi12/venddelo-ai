import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:mexy_rider/formatters.dart';
import 'package:mexy_rider/maps/monitor_map_style.dart';
import 'package:mexy_rider/models.dart';
import 'package:mexy_rider/screens/offer_screen.dart';
import 'package:mexy_rider/widgets/offer_details_sheet.dart';
import 'package:mexy_rider/widgets/rider_slide_to_confirm.dart';
import 'package:smooth_sheets/smooth_sheets.dart';

RiderOffer _offer() {
  return RiderOffer(
    id: 'o1',
    requestId: 'r1',
    shortId: 'K7M2P',
    status: 'offered',
    expiresAt: DateTime.now().toUtc().add(const Duration(seconds: 45)),
    restaurantName: 'Tacos',
    dropoffAddress: 'Calle 1',
    collectCents: 15000,
    quotedFeeCents: 4500,
    paymentMethod: 'cash',
    packageCount: 1,
    restaurantLat: 19.43,
    restaurantLng: -99.13,
    dropoffLat: 19.44,
    dropoffLng: -99.14,
    distanceMeters: 2300,
  );
}

Future<void> _pumpSheet(
  WidgetTester tester, {
  required RiderOffer offer,
  String? errorMessage,
  bool busy = false,
  VoidCallback? onExpired,
}) {
  return tester.pumpWidget(
    MaterialApp(
      home: SheetViewport(
        child: Sheet(
          decoration: const MaterialSheetDecoration(size: SheetSize.stretch),
          child: SizedBox(
            height: 800,
            child: OfferDetailsSheet(
              offer: offer,
              errorMessage: errorMessage,
              busy: busy,
              onAccept: () {},
              onExpired: onExpired,
            ),
          ),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('offer sheet shows controller errorMessage', (tester) async {
    await _pumpSheet(
      tester,
      offer: _offer(),
      errorMessage: 'La oferta ya no está disponible',
    );

    expect(find.text('La oferta ya no está disponible'), findsOneWidget);
  });

  testWidgets('offer sheet shows distance and delivery fee', (tester) async {
    await _pumpSheet(tester, offer: _offer());

    expect(find.text('#K7M2P'), findsOneWidget);
    expect(find.text('Distancia'), findsOneWidget);
    expect(find.text('2.3 km'), findsOneWidget);
    expect(find.text('Costo de envío'), findsOneWidget);
    expect(find.text('\$45.00'), findsOneWidget);
    expect(find.text('Cobrar'), findsOneWidget);
    expect(find.text('\$195.00'), findsOneWidget);
    expect(find.text('Restaurante'), findsOneWidget);
    expect(find.text('\$150.00'), findsOneWidget);
    expect(find.text('Desliza para aceptar'), findsOneWidget);
    expect(find.text('Desliza para rechazar'), findsNothing);
  });

  testWidgets('offer sheet hides collect for transfer', (tester) async {
    await _pumpSheet(
      tester,
      offer: RiderOffer(
        id: 'o1',
        requestId: 'r1',
        shortId: 'K7M2P',
        status: 'offered',
        expiresAt: DateTime.now().toUtc().add(const Duration(seconds: 45)),
        restaurantName: 'Tacos',
        dropoffAddress: 'Calle 1',
        collectCents: 0,
        quotedFeeCents: 4500,
        paymentMethod: 'transfer',
        packageCount: 1,
      ),
    );

    expect(find.text('Cobrar'), findsNothing);
    expect(find.text('Restaurante'), findsNothing);
    expect(find.text('Transferencia'), findsOneWidget);
    expect(find.text('Costo de envío'), findsOneWidget);
    expect(find.text('\$45.00'), findsOneWidget);
  });

  testWidgets('offer sheet shows collect for terminal without restaurant pay', (
    tester,
  ) async {
    await _pumpSheet(
      tester,
      offer: RiderOffer(
        id: 'o1',
        requestId: 'r1',
        shortId: 'K7M2P',
        status: 'offered',
        expiresAt: DateTime.now().toUtc().add(const Duration(seconds: 45)),
        restaurantName: 'Tacos',
        dropoffAddress: 'Calle 1',
        collectCents: 15000,
        quotedFeeCents: 4500,
        paymentMethod: 'card_terminal',
        packageCount: 1,
      ),
    );

    expect(find.text('Cobrar'), findsOneWidget);
    expect(find.text('\$195.00'), findsOneWidget);
    expect(find.text('Restaurante'), findsNothing);
    expect(find.text('Terminal'), findsOneWidget);
  });

  testWidgets('offer sheet disables accept while busy', (tester) async {
    await _pumpSheet(tester, offer: _offer(), busy: true);

    final sliders = tester
        .widgetList<RiderSlideToConfirm>(find.byType(RiderSlideToConfirm))
        .toList();
    expect(sliders, hasLength(1));
    expect(sliders.single.onConfirmed, isNull);
  });

  testWidgets('offer sheet lists grouped stops', (tester) async {
    await _pumpSheet(
      tester,
      offer: RiderOffer(
        id: 'o1',
        requestId: 'r1',
        shortId: 'K7M2P',
        status: 'offered',
        expiresAt: DateTime.now().toUtc().add(const Duration(seconds: 45)),
        restaurantName: 'Tacos',
        dropoffAddress: 'Calle 1',
        collectCents: 15000,
        paymentMethod: 'cash',
        packageCount: 2,
        stops: const [
          RiderOfferStop(restaurantName: 'Tacos', dropoffAddress: 'Calle 1'),
          RiderOfferStop(restaurantName: 'Sushi', dropoffAddress: 'Calle 2'),
        ],
      ),
    );

    expect(find.text('Tacos', skipOffstage: false), findsOneWidget);
    expect(find.text('Calle 1', skipOffstage: false), findsOneWidget);
    expect(find.text('Sushi', skipOffstage: false), findsOneWidget);
    expect(find.text('Calle 2', skipOffstage: false), findsOneWidget);
  });

  test('offer map geometry uses road points when provided', () {
    final geometry = offerMapGeometry(
      _offer(),
      roadPoints: const [
        LatLng(19.43, -99.13),
        LatLng(19.435, -99.135),
        LatLng(19.44, -99.14),
      ],
    );
    expect(geometry.polylines, hasLength(1));
    expect(geometry.polylines.first.points, hasLength(3));
    expect(geometry.polylines.first.patterns, isNotEmpty);
    expect(geometry.polylines.first.color, MonitorMapStyle.pendingRoute);
  });

  test('offer map geometry draws a dotted origin-destination route', () {
    final geometry = offerMapGeometry(_offer());
    expect(geometry.polylines, hasLength(1));
    expect(geometry.markers, hasLength(2));
    expect(
      geometry.polylines.first.patterns,
      MonitorMapStyle.pendingRoutePatterns,
    );
    expect(geometry.polylines.first.color, MonitorMapStyle.pendingRoute);
    expect(geometry.markers.map((marker) => marker.anchor), [
      MonitorMapStyle.pinAnchor,
      MonitorMapStyle.pinAnchor,
    ]);
    expect(geometry.fitPoints, [
      const LatLng(19.43, -99.13),
      const LatLng(19.44, -99.14),
    ]);
  });

  test('offer map geometry falls back to offer coordinates', () {
    final geometry = offerMapGeometry(
      RiderOffer(
        id: 'o1',
        requestId: 'r1',
        shortId: 'K7M2P',
        status: 'offered',
        expiresAt: DateTime.now().toUtc().add(const Duration(seconds: 45)),
        restaurantName: 'Tacos',
        dropoffAddress: 'Calle 1',
        collectCents: 15000,
        quotedFeeCents: 4500,
        paymentMethod: 'cash',
        packageCount: 1,
        restaurantLat: 19.43,
        restaurantLng: -99.13,
        dropoffLat: 19.44,
        dropoffLng: -99.14,
        stops: const [
          RiderOfferStop(restaurantName: 'Tacos', dropoffAddress: 'Calle 1'),
        ],
      ),
    );

    expect(geometry.markers, hasLength(2));
    expect(geometry.polylines, hasLength(1));
    expect(geometry.fitPoints, hasLength(2));
  });

  test('formatDistanceMeters uses meters under 1 km', () {
    expect(formatDistanceMeters(2300), '2.3 km');
    expect(formatDistanceMeters(400), '400 m');
    expect(formatDistanceMeters(null), '—');
  });
}
