import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:mexy_rider/maps/monitor_map_style.dart';

void main() {
  test('monitor-style pins paint restaurant square and dropoff circle', () async {
    final restaurant = await buildRestaurantMapPin(2);
    final dropoff = await buildDropoffMapPin(2);

    expect(restaurant, isA<BitmapDescriptor>());
    expect(dropoff, isA<BitmapDescriptor>());
    expect(restaurant, isNot(dropoff));
  });
}
