import 'dart:async';

import 'package:flutter/material.dart';

import '../rider_permissions.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/rider_widgets.dart';

class PermissionsScreen extends StatefulWidget {
  const PermissionsScreen({
    super.key,
    required this.onGranted,
  });

  final VoidCallback onGranted;

  @override
  State<PermissionsScreen> createState() => _PermissionsScreenState();
}

class _PermissionsScreenState extends State<PermissionsScreen>
    with WidgetsBindingObserver {
  RiderPermissionSnapshot? _snapshot;
  bool _requesting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_refresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_refresh());
    }
  }

  Future<void> _refresh() async {
    final snapshot = await checkRiderPermissions();
    if (!mounted) {
      return;
    }
    setState(() {
      _snapshot = snapshot;
      if (snapshot.allGranted) {
        _error = null;
      }
    });
    if (snapshot.allGranted) {
      widget.onGranted();
    }
  }

  Future<void> _requestAll() async {
    setState(() {
      _requesting = true;
      _error = null;
    });
    try {
      final snapshot = await requestAllRiderPermissions();
      if (!mounted) {
        return;
      }
      setState(() => _snapshot = snapshot);
      if (snapshot.allGranted) {
        widget.onGranted();
        return;
      }
      setState(() {
        _error = snapshot.needsSettings
            ? 'Faltan permisos. En ajustes, activa ubicación “Siempre” y las notificaciones.'
            : 'Aún faltan permisos. Intenta de nuevo o abre ajustes.';
      });
    } finally {
      if (mounted) {
        setState(() => _requesting = false);
      }
    }
  }

  Future<void> _openSettings() async {
    await openRiderPermissionSettings();
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = _snapshot;

    return Scaffold(
      body: SafeArea(
        child: RiderScreenPadding(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: snapshot == null
                    ? const Center(child: CircularProgressIndicator())
                    : SingleChildScrollView(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const SizedBox(height: 12),
                            Text(
                              'Permisos necesarios',
                              style: Theme.of(context).textTheme.headlineMedium,
                            ),
                            const SizedBox(height: 10),
                            Text(
                              'Para recibir ofertas y repartir en línea, Mexy necesita GPS en segundo plano y notificaciones.',
                              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                                    color: AppColors.textSecondary,
                                  ),
                            ),
                            const SizedBox(height: 24),
                            _PermissionTile(
                              title: 'GPS activado',
                              subtitle:
                                  'El teléfono debe tener ubicación encendida.',
                              granted: snapshot.locationServiceEnabled,
                            ),
                            const SizedBox(height: 10),
                            _PermissionTile(
                              title: 'Ubicación siempre',
                              subtitle:
                                  'Para seguir tu ruta aunque la app esté en segundo plano.',
                              granted: snapshot.locationAlwaysGranted,
                            ),
                            const SizedBox(height: 10),
                            _PermissionTile(
                              title: 'Notificaciones',
                              subtitle:
                                  'Para el servicio en línea y avisos del sistema.',
                              granted: snapshot.notificationsGranted,
                            ),
                            if (snapshot.firebaseAvailable) ...[
                              const SizedBox(height: 10),
                              _PermissionTile(
                                title: 'Alertas de ofertas',
                                subtitle:
                                    'Para avisarte al instante cuando llegue un envío.',
                                granted: snapshot.pushNotificationsGranted,
                              ),
                            ],
                            const SizedBox(height: 16),
                          ],
                        ),
                      ),
              ),
              if (_error != null) ...[
                RiderErrorBanner(message: _error!),
                const SizedBox(height: 12),
              ],
              if (snapshot != null && snapshot.needsSettings)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: RiderSecondaryButton(
                    label: 'Abrir ajustes',
                    onPressed: _requesting ? null : _openSettings,
                  ),
                ),
              RiderPrimaryButton(
                label: _requesting ? 'Solicitando…' : 'Activar permisos',
                onPressed: _requesting || snapshot == null ? null : _requestAll,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PermissionTile extends StatelessWidget {
  const _PermissionTile({
    required this.title,
    required this.subtitle,
    required this.granted,
  });

  final String title;
  final String subtitle;
  final bool granted;

  @override
  Widget build(BuildContext context) {
    final color = granted ? AppColors.success : AppColors.textMuted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        border: Border.all(
          color: granted ? AppColors.border : AppColors.cta.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            granted ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
            color: color,
            size: 28,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
