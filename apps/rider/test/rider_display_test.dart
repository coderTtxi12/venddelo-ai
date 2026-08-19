import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/config.dart';
import 'package:mexy_rider/rider_display.dart';

void main() {
  test('motorcycleColorHex maps named colors and hex', () {
    expect(motorcycleColorHex('Rojo'), '#DC2626');
    expect(motorcycleColorHex('#1d4ed8'), '#1D4ED8');
    expect(motorcycleColorHex(''), '#2563EB');
  });

  test('riderPhotoUrl builds a public storage URL from a path', () {
    expect(riderPhotoUrl(null), isNull);
    expect(riderPhotoUrl(''), isNull);
    expect(riderPhotoUrl('https://cdn.example/photo.webp'), 'https://cdn.example/photo.webp');
    if (AppConfig.supabaseUrl.isEmpty) {
      expect(riderPhotoUrl('drivers/photo.webp'), isNull);
      return;
    }
    expect(
      riderPhotoUrl('/drivers/photo.webp'),
      '${AppConfig.supabaseUrl.replaceAll(RegExp(r'/+$'), '')}/storage/v1/object/public/assets/drivers/photo.webp',
    );
  });
}
