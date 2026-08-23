String formatMoneyCents(int cents) => '\$${(cents / 100).toStringAsFixed(2)}';

/// Restaurant share + delivery fee: what the customer pays in cash.
int customerTotalCents(int collectCents, int quotedFeeCents) {
  final restaurant = collectCents < 0 ? 0 : collectCents;
  final fee = quotedFeeCents < 0 ? 0 : quotedFeeCents;
  return restaurant + fee;
}

bool showsRiderCashCollect(String paymentMethod, int collectCents) {
  return paymentMethod == 'cash' ||
      (paymentMethod == 'mixed' && collectCents > 0);
}

/// Cash and terminal: the rider charges the customer this total.
bool showsRiderCustomerCollect(String paymentMethod, int collectCents) {
  return paymentMethod == 'card_terminal' ||
      showsRiderCashCollect(paymentMethod, collectCents);
}

enum RiderCashFocus { none, restaurant, collect }

/// Before pickup the rider pays the restaurant first; after pickup they collect.
RiderCashFocus riderCashFocusForStatus(String status) {
  return switch (status) {
    'assigned' => RiderCashFocus.restaurant,
    'picked_up' || 'in_transit' => RiderCashFocus.collect,
    _ => RiderCashFocus.none,
  };
}

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
