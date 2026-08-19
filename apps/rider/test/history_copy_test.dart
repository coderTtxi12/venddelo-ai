import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/history_copy.dart';

void main() {
  test('empty period copy is rider-facing', () {
    expect(historyEmptyMessage, 'Aún no hay pedidos en este periodo.');
    expect(historyEmptyHint.contains('rango'), isTrue);
    expect(historyEmptyMessage.contains('API'), isFalse);
  });

  test('status badges are Spanish', () {
    expect(historyStatusLabel('delivered'), 'Entregado');
    expect(historyStatusLabel('cancelled'), 'Cancelado');
  });

  test('delivery summary uses Spanish counts', () {
    expect(
      historyDeliverySummary(delivered: 0, cancelled: 0),
      '0 entregadas · 0 canceladas',
    );
    expect(
      historyDeliverySummary(delivered: 1, cancelled: 1),
      '1 entregada · 1 cancelada',
    );
  });

  test('history phone masks leading digits with a short dot hint', () {
    expect(historyMaskedPhone('+52 55 1234 5678'), '···· 5678');
    expect(historyMaskedPhone('1234'), '1234');
    expect(historyMaskedPhone(''), '');
  });

  test('history dropoff keeps the first word and a short hidden hint', () {
    expect(
      historyMaskedDropoff('Calle Reforma 123, Col. Centro, CDMX'),
      'Calle ···',
    );
    expect(historyMaskedDropoff('Insurgentes'), 'Insurgentes');
    expect(historyMaskedDropoff(''), '');
  });
}
