int remainingSecondsFromExpiresAt(DateTime expiresAt, {DateTime? now}) {
  final current = now ?? DateTime.now().toUtc();
  final expiry = expiresAt.isUtc ? expiresAt : expiresAt.toUtc();
  final remaining = expiry.difference(current).inSeconds;
  return remaining < 0 ? 0 : remaining;
}

int remainingSecondsFromExpiresAtIso(String expiresAt, {DateTime? now}) {
  return remainingSecondsFromExpiresAt(DateTime.parse(expiresAt), now: now);
}
