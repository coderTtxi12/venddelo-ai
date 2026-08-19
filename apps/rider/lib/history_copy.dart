import 'history_period.dart';

const historyEmptyMessage = 'Aún no hay pedidos en este periodo.';
const historyEmptyHint = 'Cambia el rango o vuelve cuando completes una entrega.';

String historyStatusLabel(String status) {
  return switch (status) {
    'delivered' => 'Entregado',
    'cancelled' => 'Cancelado',
    _ => status,
  };
}

String historyPeriodTitle(HistoryPeriod period) {
  return switch (period) {
    HistoryPeriod.today => 'Hoy',
    HistoryPeriod.week => 'Esta semana',
    HistoryPeriod.month => 'Este mes',
    HistoryPeriod.custom => 'Rango',
  };
}

String historyDeliverySummary({
  required int delivered,
  required int cancelled,
}) {
  final deliveredLabel = delivered == 1 ? '1 entregada' : '$delivered entregadas';
  final cancelledLabel = cancelled == 1 ? '1 cancelada' : '$cancelled canceladas';
  return '$deliveredLabel · $cancelledLabel';
}

const historyPhoneMask = '····';
const historyAddressMask = '···';

String historyMaskedPhone(String phone) {
  final digits = phone.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) {
    return '';
  }
  if (digits.length <= 4) {
    return digits;
  }
  return '$historyPhoneMask ${digits.substring(digits.length - 4)}';
}

String historyMaskedDropoff(String address) {
  final match = RegExp(r'\S+').firstMatch(address.trim());
  if (match == null) {
    return '';
  }
  final firstWord = match.group(0)!;
  final rest = address.trim().substring(match.end).trim();
  if (rest.isEmpty) {
    return firstWord;
  }
  return '$firstWord $historyAddressMask';
}
