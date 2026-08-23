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
      'case_applied': 'C',
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
    expect(assignment.caseApplied, 'C');
    expect(paymentLabel(assignment.paymentMethod), 'Efectivo');
    expect(packageSizeLabel(assignment.packageSize), 'Grande');
    expect(packageCountLabel(assignment.packageCount), '2 paquetes');
  });

  test('paymentLabel maps mixed grouped offers', () {
    expect(paymentLabel('mixed'), 'Mixto');
  });

  test('customerTotalCents adds restaurant collect and delivery fee', () {
    expect(customerTotalCents(25000, 4500), 29500);
    expect(customerTotalCents(0, 4500), 4500);
    expect(customerTotalCents(15000, 0), 15000);
  });

  test('showsRiderCashCollect is cash or mixed with restaurant amount', () {
    expect(showsRiderCashCollect('cash', 15000), isTrue);
    expect(showsRiderCashCollect('mixed', 8000), isTrue);
    expect(showsRiderCashCollect('mixed', 0), isFalse);
    expect(showsRiderCashCollect('transfer', 15000), isFalse);
    expect(showsRiderCashCollect('card_terminal', 15000), isFalse);
  });

  test('showsRiderCustomerCollect includes terminal charges', () {
    expect(showsRiderCustomerCollect('card_terminal', 15000), isTrue);
    expect(showsRiderCustomerCollect('card_terminal', 0), isTrue);
    expect(showsRiderCustomerCollect('cash', 15000), isTrue);
    expect(showsRiderCustomerCollect('transfer', 15000), isFalse);
  });

  test('riderCashFocusForStatus follows pickup then dropoff', () {
    expect(riderCashFocusForStatus('assigned'), RiderCashFocus.restaurant);
    expect(riderCashFocusForStatus('picked_up'), RiderCashFocus.collect);
    expect(riderCashFocusForStatus('in_transit'), RiderCashFocus.collect);
    expect(riderCashFocusForStatus('delivered'), RiderCashFocus.none);
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
    expect(
      applyRiderCreditFromEvent(profile, {
        'type': 'rider.updated',
        'credit_held_cents': 0,
      }).creditAvailableCents,
      50000,
    );
    expect(profile.itinerary, isEmpty);
    expect(profile.plate, isEmpty);
  });

  test('RiderProfile.fromJson keeps vehicle and photo path', () {
    final profile = RiderProfile.fromJson({
      'id': 'd1',
      'first_name': 'Ana',
      'last_name': 'Pérez',
      'is_online': true,
      'assignments': const [],
      'profile_photo_path': 'drivers/ana.webp',
      'plate': 'ABC123',
      'motorcycle_brand': 'Italika',
      'motorcycle_color': 'Rojo',
    });

    expect(profile.profilePhotoPath, 'drivers/ana.webp');
    expect(profile.plate, 'ABC123');
    expect(profile.motorcycleBrand, 'Italika');
    expect(profile.motorcycleColor, 'Rojo');
  });

  test('RiderProfile.fromJson keeps persisted itinerary stops', () {
    final profile = RiderProfile.fromJson({
      'id': 'd1',
      'first_name': 'Ana',
      'last_name': 'Pérez',
      'is_online': true,
      'assignments': const [],
      'itinerary': [
        {
          'sequence': 1,
          'kind': 'restaurant',
          'request_id': 'r1',
          'current': true,
          'title': 'Tacos',
          'action': 'Recoger',
          'lat': 19.43,
          'lng': -99.13,
        },
      ],
    });

    expect(profile.itinerary, hasLength(1));
    expect(profile.itinerary.first.kind, 'restaurant');
    expect(profile.itinerary.first.requestId, 'r1');
    expect(profile.itinerary.first.action, 'Recoger');
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
