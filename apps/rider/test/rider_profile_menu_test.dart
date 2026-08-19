import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/theme/app_theme.dart';
import 'package:mexy_rider/widgets/rider_profile_menu.dart';

void main() {
  testWidgets('profile menu shows options before account', (tester) async {
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
            onOpenAccount: () => openedAccount = true,
            onSignOut: () => signedOut = true,
          ),
        ),
      ),
    );

    expect(find.text('Ana López'), findsOneWidget);
    expect(find.text('En línea'), findsOneWidget);
    expect(find.text(r'$125.00'), findsOneWidget);
    expect(find.text('Historial y ganancias'), findsOneWidget);
    expect(find.text('Cerrar sesión'), findsOneWidget);

    await tester.tap(find.text('Historial y ganancias'));
    await tester.pump();
    expect(openedAccount, isTrue);
    expect(signedOut, isFalse);
  });

  testWidgets('sign out is a separate menu action', (tester) async {
    var signedOut = false;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: RiderProfileMenuSheet(
            name: 'Ana López',
            isOnline: false,
            onOpenAccount: () {},
            onSignOut: () => signedOut = true,
          ),
        ),
      ),
    );

    expect(find.text('Desconectado'), findsOneWidget);
    await tester.tap(find.text('Cerrar sesión'));
    await tester.pump();
    expect(signedOut, isTrue);
  });
}
