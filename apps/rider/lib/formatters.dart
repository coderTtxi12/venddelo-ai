String formatMoneyCents(int cents) => '\$${(cents / 100).toStringAsFixed(2)}';

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
