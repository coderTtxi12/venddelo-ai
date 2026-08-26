import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:mexy_rider/maps/decode_polyline.dart';
import 'package:mexy_rider/maps/google_routes.dart';
import 'package:mexy_rider/maps/nav_target.dart';
import 'package:mexy_rider/models.dart';

void main() {
  test('computeRoutesRequestBody uses Essentials SKU features only', () {
    final body = computeRoutesRequestBody(
      origin: const LatLng(19.43, -99.13),
      destination: const LatLng(19.44, -99.14),
    );

    expect(body['travelMode'], 'DRIVE');
    expect(body['routingPreference'], 'TRAFFIC_UNAWARE');
    expect(body.containsKey('extraComputations'), isFalse);
    expect(body['travelMode'], isNot('TWO_WHEELER'));
    expect(body['computeAlternativeRoutes'], isFalse);
  });

  test('straightLinePreview always has origin and destination', () {
    const origin = LatLng(19.43, -99.13);
    const destination = LatLng(19.44, -99.14);
    final preview = straightLinePreview(
      origin: origin,
      destination: destination,
    );

    expect(preview.points, [origin, destination]);
    expect(preview.distanceMeters, greaterThan(0));
  });

  test('previewRouteResult keeps one Google route and falls back to a straight line', () {
    const origin = LatLng(19.43, -99.13);
    const destination = LatLng(19.44, -99.14);
    final road = RiderRouteOption(
      id: 'route-0',
      points: [origin, const LatLng(19.435, -99.135), destination],
      distanceMeters: 1800,
      duration: const Duration(minutes: 6),
    );

    final fromGoogle = previewRouteResult(
      origin: origin,
      destination: destination,
      fetched: RiderRouteResult(routes: [road, road]),
    );
    expect(fromGoogle.routes, hasLength(1));
    expect(fromGoogle.routes.first.points, hasLength(3));

    final fallback = previewRouteResult(
      origin: origin,
      destination: destination,
    );
    expect(fallback.routes, hasLength(1));
    expect(fallback.routes.first.points, [origin, destination]);
  });

  test('previewRouteQueryKey ignores rider movement and changes with the stop', () {
    const dropoff = LatLng(19.44, -99.14);
    const restaurant = LatLng(19.43, -99.13);
    final assigned = previewRouteQueryKey(
      jobKey: 'job-1:assigned',
      destination: dropoff,
    );
    expect(
      assigned,
      previewRouteQueryKey(jobKey: 'job-1:assigned', destination: dropoff),
    );
    expect(
      assigned,
      isNot(
        previewRouteQueryKey(jobKey: 'job-1:picked_up', destination: dropoff),
      ),
    );
    expect(
      assigned,
      isNot(
        previewRouteQueryKey(jobKey: 'job-1:assigned', destination: restaurant),
      ),
    );
  });

  test('mergeRouteOptions keeps distinct paths and caps the list', () {
    RiderRouteOption option({
      required String id,
      required double midLat,
      required int meters,
    }) {
      return RiderRouteOption(
        id: id,
        points: [
          const LatLng(19.43, -99.13),
          LatLng(midLat, -99.13),
          const LatLng(19.45, -99.13),
        ],
        distanceMeters: meters,
        duration: Duration(seconds: meters),
      );
    }

    final merged = mergeRouteOptions(
      [
        [
          option(id: 'a', midLat: 19.435, meters: 1200),
          option(id: 'a-dup', midLat: 19.4351, meters: 1220),
        ],
        [
          option(id: 'b', midLat: 19.438, meters: 1800),
          option(id: 'c', midLat: 19.441, meters: 2400),
          option(id: 'd', midLat: 19.444, meters: 3000),
        ],
      ],
      maxRoutes: 4,
    );

    expect(merged, hasLength(4));
    expect(merged.first.label, 'Recomendada');
    expect(merged[1].label, 'Opción 2');
    expect(merged[2].label, 'Opción 3');
    expect(merged[3].label, 'Opción 4');
  });

  test('decodePolyline expands encoded overview path', () {
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    final points = decodePolyline(encoded);
    expect(points, hasLength(3));
    expect(points.first.latitude, closeTo(38.5, 0.01));
    expect(points.first.longitude, closeTo(-120.2, 0.01));
  });

  test('assignmentNavigationTarget uses restaurant while assigned', () {
    const assignment = RiderAssignment(
      id: 'a1',
      status: 'assigned',
      restaurantName: 'Tacos',
      dropoffAddress: 'Calle 1',
      restaurantLat: 19.43,
      restaurantLng: -99.13,
      dropoffLat: 19.44,
      dropoffLng: -99.14,
    );
    expect(
      assignmentNavigationTarget(assignment),
      const LatLng(19.43, -99.13),
    );
  });

  test('jobDestinationAddress uses restaurant while assigned', () {
    const assignment = RiderAssignment(
      id: 'a1',
      status: 'assigned',
      restaurantName: 'Tacos',
      restaurantAddress: 'Av. Reforma 100',
      dropoffAddress: 'Calle 1 del cliente',
    );
    expect(jobDestinationAddress(assignment), 'Av. Reforma 100');
    expect(jobStepLabel(assignment.status), 'Recoge el pedido');
  });

  test('jobDestinationAddress uses dropoff after pickup', () {
    const assignment = RiderAssignment(
      id: 'a1',
      status: 'picked_up',
      restaurantName: 'Tacos',
      restaurantAddress: 'Av. Reforma 100',
      dropoffAddress: 'Calle 1 del cliente',
    );
    expect(jobDestinationAddress(assignment), 'Calle 1 del cliente');
  });

  test('assignmentNavigationTarget uses dropoff after pickup', () {
    const assignment = RiderAssignment(
      id: 'a1',
      status: 'in_transit',
      restaurantName: 'Tacos',
      dropoffAddress: 'Calle 1',
      restaurantLat: 19.43,
      restaurantLng: -99.13,
      dropoffLat: 19.44,
      dropoffLng: -99.14,
    );
    expect(
      assignmentNavigationTarget(assignment),
      const LatLng(19.44, -99.14),
    );
  });

  test('splitRiderJobs keeps picking up when another package waits at the restaurant', () {
    const picked = RiderAssignment(
      id: 'a1',
      status: 'picked_up',
      restaurantName: 'Wild Rooster',
      dropoffAddress: 'Calle 1',
      restaurantLat: 19.43,
      restaurantLng: -99.13,
    );
    const waiting = RiderAssignment(
      id: 'a2',
      status: 'assigned',
      restaurantName: 'Wild Rooster',
      dropoffAddress: 'Calle 2',
      restaurantLat: 19.43,
      restaurantLng: -99.13,
    );

    final jobs = splitRiderJobs([picked, waiting]);

    expect(jobs.current?.id, 'a2');
    expect(jobs.current?.status, 'assigned');
    expect(jobs.queued.map((item) => item.id), ['a1']);
    expect(jobStepLabel(jobs.current!.status), 'Recoge el pedido');
    expect(queuedJobLabel(jobs.queued.first), 'Luego: entregar');
  });

  test('splitRiderJobs finishes the in-transit delivery before the next pickup', () {
    const delivering = RiderAssignment(
      id: 'a1',
      status: 'in_transit',
      restaurantName: 'Tacos',
      dropoffAddress: 'Calle 1',
    );
    const nextPickup = RiderAssignment(
      id: 'a2',
      status: 'assigned',
      restaurantName: 'Sushi',
      dropoffAddress: 'Calle 2',
    );

    final jobs = splitRiderJobs([delivering, nextPickup]);

    expect(jobs.current?.id, 'a1');
    expect(jobs.queued.map((item) => item.id), ['a2']);
  });

  test('splitRiderJobs inserts a case D pickup before an in-transit delivery', () {
    const delivering = RiderAssignment(
      id: 'a1',
      status: 'in_transit',
      restaurantName: 'Tacos',
      dropoffAddress: 'Calle 1',
      dropoffLat: 19.44,
      dropoffLng: -99.14,
      caseApplied: 'A',
    );
    const detour = RiderAssignment(
      id: 'a2',
      status: 'assigned',
      restaurantName: 'Sushi',
      dropoffAddress: 'Calle 2',
      restaurantLat: 19.435,
      restaurantLng: -99.135,
      caseApplied: 'D',
    );

    final jobs = splitRiderJobs([delivering, detour]);

    expect(jobs.current?.id, 'a2');
    expect(jobs.current?.status, 'assigned');
    expect(jobs.queued.map((item) => item.id), ['a1']);
  });

  test('splitRiderJobs picks up the nearest restaurant first', () {
    const far = RiderAssignment(
      id: 'far',
      status: 'assigned',
      restaurantName: 'Far',
      dropoffAddress: 'Calle Far',
      restaurantLat: 19.50,
      restaurantLng: -99.20,
      caseApplied: 'C',
    );
    const near = RiderAssignment(
      id: 'near',
      status: 'assigned',
      restaurantName: 'Near',
      dropoffAddress: 'Calle Near',
      restaurantLat: 19.431,
      restaurantLng: -99.131,
      caseApplied: 'C',
    );

    final jobs = splitRiderJobs(
      [far, near],
      riderLat: 19.43,
      riderLng: -99.13,
    );

    expect(jobs.current?.id, 'near');
    expect(jobs.queued.map((item) => item.id), ['far']);
  });

  test('splitRiderJobs delivers the nearest dropoff first after pickups', () {
    const far = RiderAssignment(
      id: 'far',
      status: 'picked_up',
      restaurantName: 'Tacos',
      dropoffAddress: 'Far',
      dropoffLat: 19.50,
      dropoffLng: -99.20,
      caseApplied: 'C',
    );
    const near = RiderAssignment(
      id: 'near',
      status: 'picked_up',
      restaurantName: 'Tacos',
      dropoffAddress: 'Near',
      dropoffLat: 19.432,
      dropoffLng: -99.132,
      caseApplied: 'C',
    );

    final jobs = splitRiderJobs(
      [far, near],
      riderLat: 19.43,
      riderLng: -99.13,
    );

    expect(jobs.current?.id, 'near');
    expect(jobs.queued.map((item) => item.id), ['far']);
  });

  test('stackedJobPins shows remaining restaurants and dropoffs', () {
    const pickup = RiderAssignment(
      id: 'a2',
      status: 'assigned',
      restaurantName: 'Sushi',
      dropoffAddress: 'Calle 2',
      restaurantLat: 19.43,
      restaurantLng: -99.13,
      dropoffLat: 19.45,
      dropoffLng: -99.15,
      caseApplied: 'D',
    );
    const delivering = RiderAssignment(
      id: 'a1',
      status: 'in_transit',
      restaurantName: 'Tacos',
      dropoffAddress: 'Calle 1',
      dropoffLat: 19.44,
      dropoffLng: -99.14,
      caseApplied: 'A',
    );

    final pins = stackedJobPins(splitRiderJobs([delivering, pickup]));

    expect(pins, hasLength(3));
    expect(pins.first.kind, 'restaurant');
    expect(pins.first.current, isTrue);
    expect(pins[1].kind, 'dropoff');
    expect(pins[1].current, isFalse);
    expect(pins.last.kind, 'dropoff');
    expect(pins.last.label, contains('Entregar'));
  });

  test('riderItineraryStops adds the later dropoff after finishing current work', () {
    const delivering = RiderAssignment(
      id: 'a1',
      status: 'in_transit',
      restaurantName: 'Tacos',
      dropoffAddress: 'Calle 1',
      dropoffLat: 19.44,
      dropoffLng: -99.14,
      customerName: 'Ana',
      caseApplied: 'A',
    );
    const nextPickup = RiderAssignment(
      id: 'a2',
      status: 'assigned',
      restaurantName: 'Sushi',
      dropoffAddress: 'Calle 2',
      restaurantLat: 19.45,
      restaurantLng: -99.15,
      dropoffLat: 19.46,
      dropoffLng: -99.16,
      caseApplied: 'B',
    );

    final stops = riderItineraryStops(splitRiderJobs([delivering, nextPickup]));

    expect(stops.map((item) => item.action), ['Entregar', 'Recoger', 'Entregar']);
    expect(stops.map((item) => item.requestId), ['a1', 'a2', 'a2']);
    expect(stops.first.title, 'Ana');
    expect(stops[1].title, 'Sushi');
    expect(stops.last.title, 'Calle 2');
  });

  test('persisted itinerary wins over nearest-neighbor job order', () {
    const near = RiderAssignment(
      id: 'near',
      status: 'assigned',
      restaurantName: 'Cerca',
      dropoffAddress: 'Drop cerca',
      restaurantLat: 19.431,
      restaurantLng: -99.131,
      dropoffLat: 19.432,
      dropoffLng: -99.132,
    );
    const far = RiderAssignment(
      id: 'far',
      status: 'assigned',
      restaurantName: 'Lejos',
      dropoffAddress: 'Drop lejos',
      restaurantLat: 19.50,
      restaurantLng: -99.20,
      dropoffLat: 19.51,
      dropoffLng: -99.21,
    );
    const itinerary = [
      PersistedItineraryStop(
        sequence: 1,
        kind: 'restaurant',
        requestId: 'far',
        title: 'Lejos',
        action: 'Recoger',
      ),
      PersistedItineraryStop(
        sequence: 2,
        kind: 'restaurant',
        requestId: 'near',
        title: 'Cerca',
        action: 'Recoger',
      ),
      PersistedItineraryStop(
        sequence: 3,
        kind: 'dropoff',
        requestId: 'near',
        title: 'Drop cerca',
        action: 'Entregar',
      ),
      PersistedItineraryStop(
        sequence: 4,
        kind: 'dropoff',
        requestId: 'far',
        title: 'Drop lejos',
        action: 'Entregar',
      ),
    ];

    final jobs = splitRiderJobs(
      [near, far],
      riderLat: 19.43,
      riderLng: -99.13,
      itinerary: itinerary,
    );
    expect(jobs.current?.id, 'far');
    expect(jobs.queued.map((item) => item.id), ['near']);

    final stops = riderItineraryStops(jobs, itinerary: itinerary);
    expect(stops.map((item) => '${item.kind}:${item.requestId}'), [
      'restaurant:far',
      'restaurant:near',
      'dropoff:near',
      'dropoff:far',
    ]);
    expect(
      navigationTargetForJobs(
        jobs.current,
        itinerary: itinerary,
        assignments: [near, far],
      ),
      const LatLng(19.50, -99.20),
    );
  });

  test('app ignores itinerary that delivers before pickup', () {
    const assigned = RiderAssignment(
      id: 'a',
      status: 'assigned',
      restaurantName: 'Tacos',
      dropoffAddress: 'Calle 1',
      restaurantLat: 19.43,
      restaurantLng: -99.13,
      dropoffLat: 19.44,
      dropoffLng: -99.14,
    );
    const invalid = [
      PersistedItineraryStop(
        sequence: 1,
        kind: 'dropoff',
        requestId: 'a',
        action: 'Entregar',
      ),
      PersistedItineraryStop(
        sequence: 2,
        kind: 'restaurant',
        requestId: 'a',
        action: 'Recoger',
      ),
    ];

    expect(pickupBeforeDropoff(invalid), isFalse);
    final jobs = splitRiderJobs([assigned], itinerary: invalid);
    expect(jobs.current?.status, 'assigned');
    expect(
      navigationTargetForJobs(
        jobs.current,
        itinerary: invalid,
        assignments: [assigned],
      ),
      const LatLng(19.43, -99.13),
    );
  });
}
