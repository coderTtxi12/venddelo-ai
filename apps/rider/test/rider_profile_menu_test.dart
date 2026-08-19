import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/theme/app_theme.dart';
import 'package:mexy_rider/widgets/rider_profile_menu.dart';
import 'package:mexy_rider/widgets/rider_slide_to_confirm.dart';

void main() {
  testWidgets('profile menu shows vehicle details and history', (tester) async {
    var openedAccount = false;
    var signedOut = false;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: RiderProfileMenuSheet(
            name: 'Ana López',
            isOnline: true,
            creditAvailableCents: 12500,
            plate: 'ABC123',
            motorcycleBrand: 'Italika',
            motorcycleColor: 'Rojo',
            onOpenAccount: () => openedAccount = true,
            onSignOut: () => signedOut = true,
          ),
        ),
      ),
    );

    expect(find.text('Ana López'), findsOneWidget);
    expect(find.text('En línea'), findsOneWidget);
    expect(find.textContaining('Moto'), findsOneWidget);
    expect(find.textContaining('Italika'), findsOneWidget);
    expect(find.textContaining('Rojo'), findsOneWidget);
    expect(find.text('Placas ABC123'), findsOneWidget);
    expect(find.textContaining(r'$125.00'), findsOneWidget);
    expect(find.text('Historial y ganancias'), findsOneWidget);
    expect(find.byType(FilledButton), findsOneWidget);
    expect(find.text('Desliza para cerrar sesión'), findsOneWidget);
    expect(
      tester.getSize(find.byType(FilledButton)).height,
      greaterThan(tester.getSize(find.byType(RiderSlideToConfirm)).height),
    );
    expect(find.text('Opciones'), findsNothing);

    await tester.tap(find.text('Historial y ganancias'));
    await tester.pump();
    expect(openedAccount, isTrue);
    expect(signedOut, isFalse);
  });

  testWidgets('a tap does not sign out; sliding confirms', (tester) async {
    var signedOut = false;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: SizedBox(
            width: 360,
            child: RiderProfileMenuSheet(
              name: 'Ana López',
              isOnline: false,
              onOpenAccount: () {},
              onSignOut: () => signedOut = true,
            ),
          ),
        ),
      ),
    );

    expect(find.text('Desconectado'), findsOneWidget);
    await tester.tap(find.byType(RiderSlideToConfirm));
    await tester.pump();
    expect(signedOut, isFalse);

    await tester.drag(
      find.descendant(
        of: find.byType(RiderSlideToConfirm),
        matching: find.byIcon(Icons.chevron_right_rounded),
      ),
      const Offset(320, 0),
    );
    await tester.pumpAndSettle();
    expect(signedOut, isTrue);
  });
}
