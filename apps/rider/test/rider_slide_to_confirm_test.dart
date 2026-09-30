import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/widgets/rider_slide_to_confirm.dart';

void main() {
  testWidgets('a tap does not confirm going offline', (tester) async {
    var confirmed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 360,
            child: RiderSlideToConfirm(
              label: 'Desliza para salir de línea',
              onConfirmed: () => confirmed = true,
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.byType(RiderSlideToConfirm));
    await tester.pump();
    expect(confirmed, isFalse);
  });

  testWidgets('sliding the thumb across confirms', (tester) async {
    var confirmed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 360,
            child: RiderSlideToConfirm(
              label: 'Desliza para salir de línea',
              onConfirmed: () => confirmed = true,
            ),
          ),
        ),
      ),
    );

    await tester.drag(find.byType(RiderSlideToConfirm), const Offset(320, 0));
    await tester.pumpAndSettle();
    expect(confirmed, isTrue);
  });

  testWidgets('slide control is larger than a standard button', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 360,
            child: RiderSlideToConfirm(
              label: 'Desliza para aceptar',
              onConfirmed: () {},
            ),
          ),
        ),
      ),
    );

    expect(
      tester.getSize(find.byType(RiderSlideToConfirm)).height,
      RiderSlideToConfirm.height,
    );
    expect(RiderSlideToConfirm.height, greaterThan(60));
  });

  testWidgets('label shine sweeps when animations are on', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 360,
            child: RiderSlideToConfirm(
              label: 'Desliza para aceptar',
              onConfirmed: () {},
            ),
          ),
        ),
      ),
    );

    expect(find.byType(ShaderMask), findsOneWidget);
    expect(find.text('Desliza para aceptar'), findsOneWidget);
  });

  testWidgets('label shine is still when reduced motion is on', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) {
          return MediaQuery(
            data: MediaQuery.of(context).copyWith(disableAnimations: true),
            child: child!,
          );
        },
        home: Scaffold(
          body: SizedBox(
            width: 360,
            child: RiderSlideToConfirm(
              label: 'Desliza para aceptar',
              onConfirmed: () {},
            ),
          ),
        ),
      ),
    );

    expect(find.byType(ShaderMask), findsNothing);
    expect(find.text('Desliza para aceptar'), findsOneWidget);
  });

  testWidgets('sliding the label, not only the thumb, confirms', (
    tester,
  ) async {
    var confirmed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 360,
            child: RiderSlideToConfirm(
              label: 'Desliza: ya entregué',
              onConfirmed: () => confirmed = true,
            ),
          ),
        ),
      ),
    );

    await tester.drag(find.text('Desliza: ya entregué'), const Offset(320, 0));
    await tester.pump();
    expect(confirmed, isTrue);
  });

  testWidgets('a failed action returns the thumb so it can slide again', (
    tester,
  ) async {
    await tester.pumpWidget(const _BusySlideHost());
    await tester.drag(find.text('Desliza: ya entregué'), const Offset(320, 0));
    await tester.pump();
    expect(find.text('Actualizando…'), findsOneWidget);

    await tester.tap(find.text('fallar'));
    await tester.pump();
    expect(find.text('Desliza: ya entregué'), findsOneWidget);

    await tester.drag(find.text('Desliza: ya entregué'), const Offset(40, 0));
    await tester.pump();
    expect(find.text('Actualizando…'), findsNothing);
  });

  test('slide haptic only fires when progress crosses a new tick', () {
    final steps = <int>[];
    playSlideTickHaptic(0.05, 0, steps.add);
    expect(steps, isEmpty);
    playSlideTickHaptic(0.2, 0, steps.add);
    expect(steps, [3]);
    playSlideTickHaptic(0.2, 3, steps.add);
    expect(steps, [3]);
  });
}

class _BusySlideHost extends StatefulWidget {
  const _BusySlideHost();

  @override
  State<_BusySlideHost> createState() => _BusySlideHostState();
}

class _BusySlideHostState extends State<_BusySlideHost> {
  var busy = false;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Column(
          children: [
            SizedBox(
              width: 360,
              child: RiderSlideToConfirm(
                label: 'Desliza: ya entregué',
                busy: busy,
                onConfirmed: busy ? null : () => setState(() => busy = true),
              ),
            ),
            TextButton(
              onPressed: () => setState(() => busy = false),
              child: const Text('fallar'),
            ),
          ],
        ),
      ),
    );
  }
}
