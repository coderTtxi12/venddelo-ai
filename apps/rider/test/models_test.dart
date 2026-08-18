import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/formatters.dart';
import 'package:mexy_rider/models.dart';

void main() {
  test('RiderAssignment.fromJson keeps payment and package details', () {
    final assignment = RiderAssignment.fromJson({
      'id': 'a1',
      'status': 'assigned',
      'restaurant_name': 'Tacos',
      'dropoff_address': 'Calle 1',
      'short_id': 'K7M2P',
      'payment_method': 'cash',
      'collect_cents': 25000,
      'cash_denomination_cents': 50000,
      'quoted_fee_cents': 4500,
      'package_count': 2,
      'package_size': 'grande',
      'notes': 'Tocar el timbre',
    });

    expect(assignment.paymentMethod, 'cash');
    expect(assignment.collectCents, 25000);
    expect(assignment.cashDenominationCents, 50000);
    expect(assignment.quotedFeeCents, 4500);
    expect(assignment.packageCount, 2);
    expect(assignment.packageSize, 'grande');
    expect(assignment.notes, 'Tocar el timbre');
    expect(assignment.customerName, isNull);
    expect(assignment.customerPhone, isNull);
    expect(paymentLabel(assignment.paymentMethod), 'Efectivo');
    expect(packageSizeLabel(assignment.packageSize), 'Grande');
    expect(packageCountLabel(assignment.packageCount), '2 paquetes');
  });

  test('RiderProfile.fromJson exposes available credit', () {
    final profile = RiderProfile.fromJson({
      'id': 'd1',
      'first_name': 'Ana',
      'last_name': 'Pérez',
      'is_online': true,
      'credit_limit_cents': 50000,
      'credit_held_cents': 15000,
      'assignments': const [],
    });

    expect(profile.creditLimitCents, 50000);
    expect(profile.creditHeldCents, 15000);
    expect(profile.creditAvailableCents, 35000);
    expect(formatMoneyCents(profile.creditAvailableCents), r'$350.00');
  });

  test('RiderAssignment.fromJson keeps customer contact after pickup', () {
    final assignment = RiderAssignment.fromJson({
      'id': 'a1',
      'status': 'picked_up',
      'restaurant_name': 'Tacos',
      'dropoff_address': 'Calle 1',
      'customer_name': 'María López',
      'customer_phone': '+525512345678',
    });

    expect(assignment.customerName, 'María López');
    expect(assignment.customerPhone, '+525512345678');
  });
}
