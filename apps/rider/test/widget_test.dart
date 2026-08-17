import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/countdown.dart';

void main() {
  test('widget test suite defers to countdown unit tests', () {
    final remaining = remainingSecondsFromExpiresAt(
      DateTime.utc(2026, 8, 17, 12, 0, 10),
      now: DateTime.utc(2026, 8, 17, 12, 0, 0),
    );
    expect(remaining, 10);
  });
}
