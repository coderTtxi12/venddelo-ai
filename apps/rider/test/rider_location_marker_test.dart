import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/widgets/rider_live_map.dart';

void main() {
  testWidgets('RiderLocationMarker paints an online pin', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: RiderLocationMarker(isOnline: true),
        ),
      ),
    );

    expect(find.byType(RiderLocationMarker), findsOneWidget);
    expect(find.byIcon(Icons.navigation_rounded), findsOneWidget);
  });
}
