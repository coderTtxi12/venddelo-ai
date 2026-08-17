import 'package:flutter/material.dart';

import '../models.dart';
import '../rider_controller.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/rider_widgets.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.controller, required this.onSignOut});

  final RiderController controller;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final profile = controller.profile;
    final name = profile == null
        ? 'Repartidor'
        : '${profile.firstName} ${profile.lastName}'.trim();

    return Scaffold(
      appBar: AppBar(
        title: Text(name),
        actions: [
          TextButton(
            onPressed: onSignOut,
            child: const Text('Salir'),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: controller,
        builder: (context, _) {
          final jobs = _splitJobs(controller.profile?.assignments ?? const []);
          final isOnline = controller.profile?.isOnline ?? false;

          return ListView(
            padding: const EdgeInsets.all(AppTheme.screenPadding),
            children: [
              RiderOnlineToggle(
                isOnline: isOnline,
                enabled: !controller.onlineBusy,
                onChanged: controller.setOnline,
              ),
              const SizedBox(height: 16),
              if (controller.showIosKillWarning) ...[
                const RiderInfoBanner(
                  message:
                      'Si cierras la app deslizándola hacia arriba, el GPS se detiene y no recibirás ofertas hasta que la abras de nuevo.',
                ),
                const SizedBox(height: 16),
              ],
              if (controller.errorMessage != null) ...[
                RiderErrorBanner(message: controller.errorMessage!),
                const SizedBox(height: 16),
              ],
              if (controller.needsLocationSettings)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: controller.openLocationSettings,
                    child: const Text('Abrir ajustes de ubicación'),
                  ),
                ),
              if (jobs.current == null)
                RiderStatusCard(
                  title: isOnline ? 'Esperando ofertas' : 'Estás fuera de línea',
                  subtitle: isOnline
                      ? 'Te avisaremos cuando llegue una nueva entrega.'
                      : 'Activa el interruptor de arriba para empezar a recibir ofertas.',
                  leading: Icon(
                    isOnline ? Icons.radar_rounded : Icons.pause_circle_outline_rounded,
                    size: 32,
                    color: isOnline ? AppColors.online : AppColors.textMuted,
                  ),
                )
              else
                _JobCard(
                  assignment: jobs.current!,
                  onAction: (action) => controller.transitionAssignment(
                    jobs.current!.id,
                    action,
                  ),
                ),
              for (final queued in jobs.queued)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.schedule_rounded,
                            color: AppColors.textMuted,
                            size: 28,
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Text(
                              'Luego: recoger en ${queued.restaurantName}',
                              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _JobSplit {
  const _JobSplit({this.current, this.queued = const []});

  final RiderAssignment? current;
  final List<RiderAssignment> queued;
}

_JobSplit _splitJobs(List<RiderAssignment> assignments) {
  final inProgress = assignments
      .where((item) => item.status == 'picked_up' || item.status == 'in_transit')
      .toList();
  final assigned = assignments.where((item) => item.status == 'assigned').toList();
  if (inProgress.isNotEmpty) {
    return _JobSplit(current: inProgress.first, queued: assigned);
  }
  if (assigned.isEmpty) {
    return const _JobSplit();
  }
  return _JobSplit(current: assigned.first, queued: assigned.skip(1).toList());
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.assignment, required this.onAction});

  final RiderAssignment assignment;
  final ValueChanged<String> onAction;

  String _stepLabel(String status) {
    return switch (status) {
      'assigned' => 'Paso 1 · Recoger pedido',
      'picked_up' => 'Paso 2 · Ir a entregar',
      'in_transit' => 'Paso 3 · Confirmar entrega',
      _ => 'Envío activo',
    };
  }

  @override
  Widget build(BuildContext context) {
    final action = switch (assignment.status) {
      'assigned' => ('picked-up', 'Ya recogí el pedido'),
      'picked_up' => ('in-transit', 'Ya voy en camino'),
      'in_transit' => ('delivered', 'Ya entregué'),
      _ => null,
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _stepLabel(assignment.status),
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: AppColors.accent,
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 12),
            Text(
              assignment.restaurantName,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 10),
            Text(
              assignment.dropoffAddress,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            if (action != null) ...[
              const SizedBox(height: 20),
              RiderPrimaryButton(
                label: action.$2,
                color: AppColors.accentBright,
                onPressed: () => onAction(action.$1),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
