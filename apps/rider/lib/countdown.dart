int remainingSecondsFromExpiresAt(DateTime expiresAt, {DateTime? now}) {
  final current = now ?? DateTime.now().toUtc();
  final expiry = expiresAt.isUtc ? expiresAt : expiresAt.toUtc();
  final remaining = expiry.difference(current).inSeconds;
  return remaining < 0 ? 0 : remaining;
}

int remainingSecondsFromExpiresAtIso(String expiresAt, {DateTime? now}) {
  return remainingSecondsFromExpiresAt(DateTime.parse(expiresAt), now: now);
}

bool isOfferCountdownExpired(DateTime expiresAt, {DateTime? now}) {
  return remainingSecondsFromExpiresAt(expiresAt, now: now) == 0;
}

/// Hide an offer the rider already dismissed locally after expiry, even if the
/// API still returns it for a few seconds.
T? visibleOfferIgnoringDismissedExpiry<T>({
  required T? offer,
  required String? Function(T offer) idOf,
  required DateTime Function(T offer) expiresAtOf,
  required Set<String> dismissedExpiredIds,
  DateTime? now,
}) {
  if (offer == null) return null;
  if (!dismissedExpiredIds.contains(idOf(offer))) return offer;
  if (!isOfferCountdownExpired(expiresAtOf(offer), now: now)) return offer;
  return null;
}
