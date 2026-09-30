import 'dart:math';

class LocationPostBackoffState {
  const LocationPostBackoffState({
    this.failureStreak = 0,
    this.blockedUntil,
  });

  final int failureStreak;
  final DateTime? blockedUntil;

  LocationPostBackoffState copyWith({
    int? failureStreak,
    DateTime? blockedUntil,
    bool clearBlockedUntil = false,
  }) {
    return LocationPostBackoffState(
      failureStreak: failureStreak ?? this.failureStreak,
      blockedUntil: clearBlockedUntil ? null : (blockedUntil ?? this.blockedUntil),
    );
  }
}

const LocationPostBackoffState kEmptyLocationPostBackoff = LocationPostBackoffState();

bool shouldAttemptLocationPost({
  required DateTime now,
  required LocationPostBackoffState state,
}) {
  final blockedUntil = state.blockedUntil;
  if (blockedUntil == null) {
    return true;
  }
  return !now.isBefore(blockedUntil);
}

int locationPostBackoffDelayMs({
  required int failureStreak,
  int? statusCode,
  int jitterMs = 0,
}) {
  if (failureStreak <= 0) {
    return 0;
  }
  final baseMs = statusCode == 429 ? 15_000 : 8_000;
  final exponent = min(failureStreak - 1, 4);
  final scaled = min(baseMs * pow(2, exponent).toInt(), 60_000);
  return scaled + max(0, jitterMs);
}

bool shouldBackoffLocationPostStatus(int statusCode) {
  return statusCode == 429 || statusCode == 408 || statusCode >= 500;
}

LocationPostBackoffState recordLocationPostSuccess(
  LocationPostBackoffState state,
) {
  return kEmptyLocationPostBackoff;
}

LocationPostBackoffState recordLocationPostFailure({
  required LocationPostBackoffState state,
  required DateTime now,
  int? statusCode,
  int jitterMs = 0,
}) {
  final streak = min(state.failureStreak + 1, 8);
  final delayMs = locationPostBackoffDelayMs(
    failureStreak: streak,
    statusCode: statusCode,
    jitterMs: jitterMs,
  );
  return LocationPostBackoffState(
    failureStreak: streak,
    blockedUntil: now.add(Duration(milliseconds: delayMs)),
  );
}

int locationPostJitterMs({required int failureStreak, int seed = 0}) {
  final span = 250 + min(failureStreak, 6) * 120;
  return seed.abs() % span;
}
