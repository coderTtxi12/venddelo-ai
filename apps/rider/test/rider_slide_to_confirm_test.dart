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

    await tester.drag(
      find.byIcon(Icons.chevron_right_rounded),
      const Offset(320, 0),
    );
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
