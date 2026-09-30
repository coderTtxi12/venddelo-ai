import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_owner/main.dart';
import 'package:mexy_owner/state/owner_store.dart';

void main() {
  test('formats pesos with grouping', () {
    expect(formatPesos(18600), r'$186.00');
    expect(formatPesos(100000), r'$1,000.00');
  });

  testWidgets('phone opens an order and advances it', (tester) async {
    await _pump(tester, const Size(390, 844));

    expect(find.text('Mariana Solís'), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);

    await tester.tap(find.text('Mariana Solís'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Confirmar'), findsOneWidget);
    await tester.tap(find.text('Confirmar'));
    await tester.pump();

    expect(find.text('Preparar'), findsOneWidget);
    expect(find.text('Confirmado'), findsWidgets);
  });

  testWidgets('tablet landscape keeps the list and the detail together', (tester) async {
    await _pump(tester, const Size(1200, 800));

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('Selecciona un pedido'), findsOneWidget);
    expect(find.text('Mariana Solís'), findsOneWidget);

    await tester.tap(find.text('Mariana Solís'));
    await tester.pump();
    expect(find.text('Calle Morelos 88, Col. Americana'), findsOneWidget);
    expect(find.text('Selecciona un pedido'), findsNothing);
  });

  testWidgets('phone landscape uses the side rail', (tester) async {
    await _pump(tester, const Size(844, 390));

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('Selecciona un pedido'), findsOneWidget);
  });

  testWidgets('printer, delivery and settings are reachable', (tester) async {
    await _pump(tester, const Size(390, 844));

    await tester.tap(find.text('Impresora'));
    await tester.pump();
    expect(find.text('Ancho del papel'), findsOneWidget);
    expect(find.text('Vista del ticket'), findsOneWidget);

    await tester.tap(find.text('Envíos'));
    await tester.pump();
    expect(find.text('Solicitar repartidor'), findsOneWidget);
    expect(find.text('Elena Vargas'), findsOneWidget);

    await tester.tap(find.text('Ajustes'));
    await tester.pump();
    expect(find.text('Identidad'), findsOneWidget);
    expect(find.text('Guardar configuración'), findsOneWidget);
  });

  testWidgets('dark theme builds the kitchen', (tester) async {
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    await _pump(tester, const Size(390, 844));
    expect(find.text('Órdenes'), findsWidgets);
  });
}

Future<void> _pump(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(const MexyOwnerApp());
  await tester.pump();
}
