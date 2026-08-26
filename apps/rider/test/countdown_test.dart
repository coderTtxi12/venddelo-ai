import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/countdown.dart';

void main() {
  test('remainingSecondsFromExpiresAt is zero when already expired', () {
    final expiresAt = DateTime.utc(2026, 8, 17, 12, 0, 0);
    final now = DateTime.utc(2026, 8, 17, 12, 0, 5);
    expect(remainingSecondsFromExpiresAt(expiresAt, now: now), 0);
  });

  test('remainingSecondsFromExpiresAt counts whole seconds until expiry', () {
    final expiresAt = DateTime.utc(2026, 8, 17, 12, 0, 45);
    final now = DateTime.utc(2026, 8, 17, 12, 0, 0);
    expect(remainingSecondsFromExpiresAt(expiresAt, now: now), 45);
  });

  test('remainingSecondsFromExpiresAtIso parses ISO-8601 strings', () {
    final now = DateTime.utc(2026, 8, 17, 12, 0, 0);
    expect(
      remainingSecondsFromExpiresAtIso('2026-08-17T12:00:45.000Z', now: now),
      45,
    );
  });

  test('visibleOfferIgnoringDismissedExpiry hides an expired dismissed offer', () {
    const dismissed = {'offer-1'};
    expect(
      visibleOfferIgnoringDismissedExpiry<String>(
        offer: 'offer-1',
        idOf: (id) => id,
        expiresAtOf: (_) => DateTime.utc(2026, 8, 17, 12, 0, 0),
        dismissedExpiredIds: dismissed,
        now: DateTime.utc(2026, 8, 17, 12, 0, 5),
      ),
      isNull,
    );
    expect(
      visibleOfferIgnoringDismissedExpiry<String>(
        offer: 'offer-2',
        idOf: (id) => id,
        expiresAtOf: (_) => DateTime.utc(2026, 8, 17, 12, 0, 0),
        dismissedExpiredIds: dismissed,
        now: DateTime.utc(2026, 8, 17, 12, 0, 5),
      ),
      'offer-2',
    );
  });
}
