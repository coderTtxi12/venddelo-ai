import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Slide-to-confirm so riders cannot change online status with an accidental tap.
class RiderSlideToConfirm extends StatefulWidget {
  const RiderSlideToConfirm({
    super.key,
    required this.label,
    required this.onConfirmed,
    this.enabled = true,
    this.busy = false,
    this.color = AppColors.primary,
  });

  static const double height = 76;
  static const double thumbSize = 64;

  final String label;
  final VoidCallback? onConfirmed;
  final bool enabled;
  final bool busy;
  final Color color;

  @override
  State<RiderSlideToConfirm> createState() => _RiderSlideToConfirmState();
}

class _RiderSlideToConfirmState extends State<RiderSlideToConfirm>
    with SingleTickerProviderStateMixin {
  static const _inset = 6.0;
  static const _completeRatio = 0.82;

  double _dx = 0;
  int _hapticStep = -1;
  late final AnimationController _snap;

  bool get _interactive =>
      widget.enabled && !widget.busy && widget.onConfirmed != null;

  @override
  void initState() {
    super.initState();
    _snap = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 220),
    );
  }

  @override
  void didUpdateWidget(covariant RiderSlideToConfirm oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.busy && !widget.busy || oldWidget.label != widget.label) {
      _dx = 0;
      _hapticStep = -1;
    }
  }

  @override
  void dispose() {
    _snap.dispose();
    super.dispose();
  }

  double _maxDx(double width) =>
      (width - RiderSlideToConfirm.thumbSize - _inset * 2).clamp(0, 400);

  void _snapBack() {
    final start = _dx;
    _snap
      ..stop()
      ..reset();
    final animation = Tween<double>(
      begin: start,
      end: 0,
    ).animate(CurvedAnimation(parent: _snap, curve: Curves.easeOutCubic));
    void tick() {
      if (!mounted) {
        return;
      }
      setState(() => _dx = animation.value);
    }

    animation.addListener(tick);
    _snap.forward().whenComplete(() {
      animation.removeListener(tick);
    });
  }

  void _onDragStart() {
    if (!_interactive) {
      return;
    }
    _hapticStep = 0;
    playSlideStartHaptic();
  }

  void _onDragUpdate(DragUpdateDetails details, double maxDx) {
    if (!_interactive) {
      return;
    }
    setState(() {
      _dx = (_dx + details.delta.dx).clamp(0, maxDx);
    });
    final progress = maxDx == 0 ? 0.0 : _dx / maxDx;
    playSlideTickHaptic(progress, _hapticStep, (step) => _hapticStep = step);
  }

  void _onDragEnd(double maxDx) {
    if (!_interactive) {
      return;
    }
    if (maxDx > 0 && _dx >= maxDx * _completeRatio) {
      setState(() => _dx = maxDx);
      playSlideCompleteHaptic();
      widget.onConfirmed?.call();
      return;
    }
    _hapticStep = -1;
    _snapBack();
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    return Semantics(
      button: true,
      enabled: _interactive,
      label: widget.busy
          ? 'Actualizando estado en línea'
          : '${widget.label}. Desliza el control hacia la derecha para confirmar.',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final maxDx = _maxDx(width);
          final progress = maxDx == 0 ? 0.0 : (_dx / maxDx).clamp(0.0, 1.0);
          return AnimatedOpacity(
            duration: const Duration(milliseconds: 180),
            opacity: _interactive ? 1 : 0.55,
            child: Container(
              width: double.infinity,
              height: RiderSlideToConfirm.height,
              decoration: BoxDecoration(
                color: widget.color,
                borderRadius: BorderRadius.circular(AppTheme.buttonRadius + 2),
              ),
              child: Stack(
                alignment: Alignment.centerLeft,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(
                      left: RiderSlideToConfirm.thumbSize + 14,
                      right: 18,
                    ),
                    child: Opacity(
                      opacity: (1 - progress * 1.2).clamp(0.0, 1.0),
                      child: _SlideLabelShine(
                        text: widget.busy ? 'Actualizando…' : widget.label,
                        enabled: _interactive && progress < 0.18,
                        reduceMotion: reduceMotion,
                      ),
                    ),
                  ),
                  Positioned(
                    left: _inset + _dx,
                    top: _inset,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onHorizontalDragStart: (_) => _onDragStart(),
                      onHorizontalDragUpdate: (details) =>
                          _onDragUpdate(details, maxDx),
                      onHorizontalDragEnd: (_) => _onDragEnd(maxDx),
                      child: Container(
                        width: RiderSlideToConfirm.thumbSize,
                        height: RiderSlideToConfirm.thumbSize,
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(16),
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x33000000),
                              blurRadius: 10,
                              offset: Offset(0, 2),
                            ),
                          ],
                        ),
                        child: widget.busy
                            ? Padding(
                                padding: const EdgeInsets.all(16),
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.6,
                                  color: widget.color,
                                ),
                              )
                            : Icon(
                                Icons.chevron_right_rounded,
                                color: widget.color,
                                size: reduceMotion ? 32 : 38,
                              ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Left-to-right highlight on the CTA copy, iOS slide-to-unlock style.
class _SlideLabelShine extends StatefulWidget {
  const _SlideLabelShine({
    required this.text,
    required this.enabled,
    required this.reduceMotion,
  });

  final String text;
  final bool enabled;
  final bool reduceMotion;

  @override
  State<_SlideLabelShine> createState() => _SlideLabelShineState();
}

class _SlideLabelShineState extends State<_SlideLabelShine>
    with SingleTickerProviderStateMixin {
  late final AnimationController _shine;

  @override
  void initState() {
    super.initState();
    _shine = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    );
    _sync();
  }

  @override
  void didUpdateWidget(covariant _SlideLabelShine oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  @override
  void dispose() {
    _shine.dispose();
    super.dispose();
  }

  void _sync() {
    final shouldRun = widget.enabled && !widget.reduceMotion;
    if (shouldRun) {
      if (!_shine.isAnimating) {
        _shine.repeat();
      }
      return;
    }
    _shine
      ..stop()
      ..value = 0;
  }

  @override
  Widget build(BuildContext context) {
    final label = Text(
      widget.text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.15,
        height: 1.1,
      ),
    );

    if (widget.reduceMotion || !widget.enabled) {
      return label;
    }

    return AnimatedBuilder(
      animation: _shine,
      builder: (context, child) {
        final t = Curves.easeInOut.transform(
          ((_shine.value - 0.08) / 0.62).clamp(0.0, 1.0),
        );
        final x = -1.35 + (t * 2.7);
        return ShaderMask(
          blendMode: BlendMode.srcIn,
          shaderCallback: (bounds) {
            return LinearGradient(
              begin: Alignment(x - 0.42, 0),
              end: Alignment(x + 0.42, 0),
              colors: const [
                Color(0x99FFFFFF),
                Color(0xFFFFFFFF),
                Color(0x99FFFFFF),
              ],
            ).createShader(bounds);
          },
          child: child,
        );
      },
      child: label,
    );
  }
}

const _slideHapticTicks = 16;

void playSlideStartHaptic() {
  if (Platform.isIOS) {
    HapticFeedback.lightImpact();
    return;
  }
  HapticFeedback.vibrate();
}

void playSlideTickHaptic(
  double progress,
  int lastStep,
  void Function(int step) onStep,
) {
  final step = (progress.clamp(0.0, 1.0) * _slideHapticTicks).floor();
  if (step <= lastStep) {
    return;
  }
  onStep(step);
  if (Platform.isIOS) {
    HapticFeedback.selectionClick();
    return;
  }
  HapticFeedback.vibrate();
}

void playSlideCompleteHaptic() {
  if (Platform.isIOS) {
    HapticFeedback.heavyImpact();
    return;
  }
  HapticFeedback.heavyImpact();
  HapticFeedback.vibrate();
}
