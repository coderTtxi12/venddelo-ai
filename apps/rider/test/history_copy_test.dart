import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/history_copy.dart';

void main() {
  test('empty period copy is rider-facing', () {
    expect(historyEmptyMessage, 'Aún no hay pedidos en este periodo.');
    expect(historyEmptyMessage.contains('API'), isFalse);
  });

  test('status badges are Spanish', () {
    expect(historyStatusLabel('delivered'), 'Entregado');
    expect(historyStatusLabel('cancelled'), 'Cancelado');
  });
}
