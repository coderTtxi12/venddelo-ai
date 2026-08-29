import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:mexy_rider/app_build.dart';
import 'package:mexy_rider/models.dart';
import 'package:mexy_rider/screens/force_update_screen.dart';
import 'package:mexy_rider/theme/app_theme.dart';

void main() {
  test('GET /rider/me query reports this APK build', () {
    expect(riderMeQuery(), {
      'app_version': '1.0.2',
      'app_build_number': '3',
    });
  });

  test('RiderProfile.fromJson reads must_update and APK URL', () {
    final blocked = RiderProfile.fromJson({
      'id': 'd1',
      'first_name': 'Ana',
      'last_name': 'Pérez',
      'is_online': true,
      'assignments': const [],
      'must_update': true,
      'update_apk_url': 'https://cdn.example.com/mexy-rider.apk',
    });
    expect(blocked.mustUpdate, isTrue);
    expect(blocked.updateApkUrl, 'https://cdn.example.com/mexy-rider.apk');

    final current = RiderProfile.fromJson({
      'id': 'd1',
      'first_name': 'Ana',
      'last_name': 'Pérez',
      'is_online': false,
      'assignments': const [],
    });
    expect(current.mustUpdate, isFalse);
    expect(current.updateApkUrl, isNull);
  });

  testWidgets('ForceUpdateScreen has no map and shows download when URL exists', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: ForceUpdateScreen(
          apkUrl: 'https://cdn.example.com/mexy-rider.apk',
        ),
      ),
    );

    expect(find.text('Actualiza la app'), findsOneWidget);
    expect(find.text('Descargar actualización'), findsOneWidget);
    expect(find.byType(GoogleMap), findsNothing);
    expect(find.text('En línea'), findsNothing);
  });

  testWidgets('ForceUpdateScreen still blocks without an APK URL', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: const ForceUpdateScreen(),
      ),
    );

    expect(find.text('Actualiza la app'), findsOneWidget);
    expect(find.text('Descargar actualización'), findsNothing);
    expect(find.byType(GoogleMap), findsNothing);
  });
}
