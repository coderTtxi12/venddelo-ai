import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/models.dart';
import 'package:mexy_rider/screens/offer_screen.dart';

RiderOffer _offer() {
  return RiderOffer(
    id: 'o1',
    requestId: 'r1',
    status: 'offered',
    expiresAt: DateTime.now().toUtc().add(const Duration(seconds: 45)),
    restaurantName: 'Tacos',
    dropoffAddress: 'Calle 1',
    collectCents: 15000,
    paymentMethod: 'cash',
    packageCount: 1,
  );
}

void main() {
  testWidgets('OfferScreen shows controller errorMessage', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: OfferScreen(
          offer: _offer(),
          errorMessage: 'La oferta ya no está disponible',
          busy: false,
          onAccept: () {},
          onReject: () {},
        ),
      ),
    );

    expect(find.text('La oferta ya no está disponible'), findsOneWidget);
  });

  testWidgets('OfferScreen disables accept and reject while busy', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: OfferScreen(
          offer: _offer(),
          errorMessage: null,
          busy: true,
          onAccept: () {},
          onReject: () {},
        ),
      ),
    );

    final accept = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Aceptar'));
    final reject = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Rechazar'),
    );
    expect(accept.onPressed, isNull);
    expect(reject.onPressed, isNull);
  });

  testWidgets('OfferScreen lists grouped stops', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: OfferScreen(
          offer: RiderOffer(
            id: 'o1',
            requestId: 'r1',
            status: 'offered',
            expiresAt: DateTime.now().toUtc().add(const Duration(seconds: 45)),
            restaurantName: 'Tacos',
            dropoffAddress: 'Calle 1',
            collectCents: 15000,
            paymentMethod: 'cash',
            packageCount: 2,
            stops: const [
              RiderOfferStop(restaurantName: 'Tacos', dropoffAddress: 'Calle 1'),
              RiderOfferStop(restaurantName: 'Sushi', dropoffAddress: 'Calle 2'),
            ],
          ),
          onAccept: () {},
          onReject: () {},
        ),
      ),
    );

    expect(find.text('Tacos'), findsOneWidget);
    expect(find.text('Calle 1'), findsOneWidget);
    expect(find.text('Sushi'), findsOneWidget);
    expect(find.text('Calle 2'), findsOneWidget);
  });
}
