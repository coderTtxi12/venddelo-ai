String formatMoneyCents(int cents) => '\$${(cents / 100).toStringAsFixed(2)}';

String formatDayMonth(DateTime value) {
  final day = value.day.toString().padLeft(2, '0');
  final month = value.month.toString().padLeft(2, '0');
  return '$day/$month';
}

String formatClosedAtLocal(DateTime value) {
  final local = value.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = local.month.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$day/$month $hour:$minute';
}

String formatDistanceMeters(int? meters) {
  if (meters == null) {
    return '—';
  }
  if (meters < 1000) {
    return '$meters m';
  }
  return '${(meters / 1000).toStringAsFixed(1)} km';
}

String paymentLabel(String method) {
  return switch (method) {
    'cash' => 'Efectivo',
    'transfer' => 'Transferencia',
    'card_terminal' => 'Terminal',
    'mixed' => 'Mixto',
    _ => method,
  };
}

String packageSizeLabel(String size) {
  return switch (size) {
    'grande' => 'Grande',
    'normal' => 'Normal',
    _ => size,
  };
}

String packageCountLabel(int count) {
  return count == 1 ? '1 paquete' : '$count paquetes';
}
