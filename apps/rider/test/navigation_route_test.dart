import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:mexy_rider/maps/decode_polyline.dart';
import 'package:mexy_rider/maps/google_routes.dart';
import 'package:mexy_rider/maps/nav_target.dart';
import 'package:mexy_rider/models.dart';

void main() {
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
}
