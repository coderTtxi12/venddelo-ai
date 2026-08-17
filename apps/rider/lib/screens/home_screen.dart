import 'package:flutter/material.dart';

import '../models.dart';
import '../rider_controller.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.controller, required this.onSignOut});

  final RiderController controller;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final profile = controller.profile;
    final name = profile == null
        ? 'Rider'
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
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              SwitchListTile(
                title: const Text('En línea'),
                value: controller.profile?.isOnline ?? false,
                onChanged: controller.onlineBusy
                    ? null
                    : (value) => controller.setOnline(value),
              ),
              if (controller.showIosKillWarning)
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
                  child: Text(
                    'Si cierras la app deslizándola hacia arriba, el GPS se detiene y no recibirás ofertas hasta que la abras de nuevo.',
                  ),
                ),
              if (controller.errorMessage != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    controller.errorMessage!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
              if (controller.needsLocationSettings)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: controller.openLocationSettings,
                      child: const Text('Abrir ajustes'),
                    ),
                  ),
                ),
              if (jobs.current == null)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('Sin envío activo. Ponte en línea para recibir ofertas.'),
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
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Text('Luego: recoger en ${queued.restaurantName}'),
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

  @override
  Widget build(BuildContext context) {
    final action = switch (assignment.status) {
      'assigned' => ('picked-up', 'Recogí'),
      'picked_up' => ('in-transit', 'En camino'),
      'in_transit' => ('delivered', 'Entregué'),
      _ => null,
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              assignment.restaurantName,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(assignment.dropoffAddress),
            const SizedBox(height: 16),
            if (action != null)
              FilledButton(
                onPressed: () => onAction(action.$1),
                child: Text(action.$2),
              ),
          ],
        ),
      ),
    );
  }
}
