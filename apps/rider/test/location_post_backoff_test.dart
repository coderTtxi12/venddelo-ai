import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/location_post_backoff.dart';

void main() {
  test('allows posts when backoff window expired', () {
    final now = DateTime.utc(2026, 9, 29, 12);
    final state = LocationPostBackoffState(
      failureStreak: 1,
      blockedUntil: now.subtract(const Duration(seconds: 1)),
    );
    expect(shouldAttemptLocationPost(now: now, state: state), isTrue);
  });

  test('blocks posts during backoff after 429', () {
    final now = DateTime.utc(2026, 9, 29, 12);
    final state = recordLocationPostFailure(
      state: kEmptyLocationPostBackoff,
      now: now,
      statusCode: 429,
      jitterMs: 0,
    );
    expect(shouldAttemptLocationPost(now: now, state: state), isFalse);
    expect(
      shouldAttemptLocationPost(
        now: now.add(const Duration(seconds: 16)),
        state: state,
      ),
      isTrue,
    );
  });

  test('success clears backoff without changing the 5s ping cadence helper', () {
    final blocked = recordLocationPostFailure(
      state: kEmptyLocationPostBackoff,
      now: DateTime.utc(2026, 9, 29, 12),
      statusCode: 500,
    );
    expect(recordLocationPostSuccess(blocked), kEmptyLocationPostBackoff);
  });
}
