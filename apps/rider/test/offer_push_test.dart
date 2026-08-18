import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/offer_push.dart';

void main() {
  test('foreground offer copy uses FCM title and body when present', () {
    final copy = foregroundOfferCopy(
      title: 'Nueva oferta',
      body: 'Pedido en Polanco',
    );
    expect(copy.title, 'Nueva oferta');
    expect(copy.body, 'Pedido en Polanco');
  });

  test('foreground offer copy falls back when FCM has no notification payload', () {
    final copy = foregroundOfferCopy();
    expect(copy.title, 'Nueva oferta');
    expect(copy.body, 'Tienes un nuevo pedido. Ábrelo para aceptar.');
  });

  test('offer alarm starts only for an offer that is not already alarming', () {
    expect(
      shouldStartOfferAlarm(nextOfferId: 'offer-1', alarmedOfferId: null),
      isTrue,
    );
    expect(
      shouldStartOfferAlarm(nextOfferId: 'offer-1', alarmedOfferId: 'offer-1'),
      isFalse,
    );
    expect(
      shouldStartOfferAlarm(nextOfferId: 'offer-2', alarmedOfferId: 'offer-1'),
      isTrue,
    );
    expect(
      shouldStartOfferAlarm(nextOfferId: null, alarmedOfferId: null),
      isFalse,
    );
  });

  test('offer alarm stops when the alarmed offer is gone or replaced', () {
    expect(
      shouldStopOfferAlarm(nextOfferId: null, alarmedOfferId: 'offer-1'),
      isTrue,
    );
    expect(
      shouldStopOfferAlarm(nextOfferId: 'offer-2', alarmedOfferId: 'offer-1'),
      isTrue,
    );
    expect(
      shouldStopOfferAlarm(nextOfferId: 'offer-1', alarmedOfferId: 'offer-1'),
      isFalse,
    );
    expect(
      shouldStopOfferAlarm(nextOfferId: null, alarmedOfferId: null),
      isFalse,
    );
  });

  test('FCM payload offer_id is used as the idempotency key', () {
    expect(offerIdFromPushData({'offer_id': 'offer-1'}), 'offer-1');
    expect(offerIdFromPushData({'type': 'offer'}), isNull);
    expect(offerIdFromPushData({'offer_id': ''}), isNull);
  });

  test('offer alarm repeats the bell several times', () {
    expect(offerAlarmRepeatCount, greaterThanOrEqualTo(6));
  });
}
