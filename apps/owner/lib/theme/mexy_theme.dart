import 'package:flutter/material.dart';

/// Mexy panel colors, tuned for a dense kitchen UI.
/// Indigo matches the restaurant dashboard. Amber is only a status accent.
abstract final class MexyColors {
  static const indigo = Color(0xFF4F46E5);
  static const indigoPressed = Color(0xFF4338CA);
  static const background = Color(0xFFF8FAFC);
  static const backgroundDark = Color(0xFF0F172A);
  static const surfaceDark = Color(0xFF1E293B);
  static const text = Color(0xFF1E293B);
  static const textMuted = Color(0xFF475569);
  static const border = Color(0xFFE2E8F0);
  static const ticketPaper = Color(0xFFFFFBF5);
  static const ticketInk = Color(0xFF1C1917);
}

abstract final class MexyMotion {
  static const Duration press = Duration(milliseconds: 120);
  static const Duration reveal = Duration(milliseconds: 180);

  static Duration of(BuildContext context, Duration duration) {
    if (MediaQuery.disableAnimationsOf(context)) return Duration.zero;
    return duration;
  }
}

abstract final class MexySpace {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
}

class MexyTheme {
  static ThemeData light() => _theme(Brightness.light);

  static ThemeData dark() => _theme(Brightness.dark);

  static ThemeData _theme(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final scheme = ColorScheme.fromSeed(
      seedColor: MexyColors.indigo,
      brightness: brightness,
    ).copyWith(
      primary: isLight ? MexyColors.indigo : const Color(0xFFA5B4FC),
      onPrimary: isLight ? Colors.white : const Color(0xFF1E1B4B),
      surface: isLight ? Colors.white : MexyColors.surfaceDark,
      error: const Color(0xFFDC2626),
    );

    final radius = BorderRadius.circular(12);
    final outline = OutlineInputBorder(
      borderRadius: radius,
      borderSide: BorderSide(color: scheme.outlineVariant),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor:
          isLight ? MexyColors.background : MexyColors.backgroundDark,
      splashFactory: InkSparkle.splashFactory,
      visualDensity: VisualDensity.standard,
      textTheme: (isLight
              ? Typography.material2021().black
              : Typography.material2021().white)
          .apply(
            bodyColor: scheme.onSurface,
            displayColor: scheme.onSurface,
          )
          .copyWith(
            headlineMedium: TextStyle(
              fontSize: 28,
              height: 1.15,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4,
              color: scheme.onSurface,
            ),
            titleLarge: TextStyle(
              fontSize: 18,
              height: 1.25,
              fontWeight: FontWeight.w600,
              color: scheme.onSurface,
            ),
            titleMedium: TextStyle(
              fontSize: 15,
              height: 1.3,
              fontWeight: FontWeight.w600,
              color: scheme.onSurface,
            ),
            bodyMedium: TextStyle(
              fontSize: 14,
              height: 1.4,
              fontWeight: FontWeight.w400,
              color: scheme.onSurface,
            ),
            bodySmall: TextStyle(
              fontSize: 13,
              height: 1.35,
              color: scheme.onSurfaceVariant,
            ),
            labelLarge: const TextStyle(
              fontSize: 14,
              height: 1.2,
              fontWeight: FontWeight.w600,
            ),
          ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: scheme.surface,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outlineVariant,
        space: 1,
        thickness: 1,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: radius),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          shape: RoundedRectangleBorder(borderRadius: radius),
          side: BorderSide(color: scheme.outlineVariant),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: radius),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: outline,
        enabledBorder: outline,
        focusedBorder: outline.copyWith(
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
        errorBorder: outline.copyWith(
          borderSide: BorderSide(color: scheme.error),
        ),
        focusedErrorBorder: outline.copyWith(
          borderSide: BorderSide(color: scheme.error, width: 1.5),
        ),
        labelStyle: TextStyle(color: scheme.onSurfaceVariant),
        hintStyle: TextStyle(color: scheme.onSurfaceVariant),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 72,
        elevation: 0,
        backgroundColor: scheme.surface,
        indicatorColor: scheme.primaryContainer,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          );
        }),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: scheme.surface,
        indicatorColor: scheme.primaryContainer,
        selectedIconTheme: IconThemeData(color: scheme.onPrimaryContainer),
        unselectedIconTheme: IconThemeData(color: scheme.onSurfaceVariant),
        labelType: NavigationRailLabelType.all,
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: radius),
      ),
      dialogTheme: DialogThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return scheme.onPrimary;
          return scheme.outline;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return scheme.primary;
          return scheme.surfaceContainerHighest;
        }),
      ),
    );
  }
}

extension MexyLayout on BuildContext {
  double get windowWidth => MediaQuery.sizeOf(this).width;

  double get windowHeight => MediaQuery.sizeOf(this).height;

  bool get isCompact => windowWidth < 600;

  bool get isExpanded => windowWidth >= 840;

  bool get isShort => windowHeight < 520;

  double get pagePadding {
    if (windowWidth >= 1200) return 28;
    if (windowWidth >= 840) return 24;
    if (windowWidth >= 600) return 20;
    return 16;
  }
}
