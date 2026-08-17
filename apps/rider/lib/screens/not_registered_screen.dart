import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../widgets/rider_widgets.dart';

class NotRegisteredScreen extends StatelessWidget {
  const NotRegisteredScreen({super.key, required this.onSignOut});

  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: RiderScreenPadding(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Icon(
                Icons.person_off_outlined,
                size: 56,
                color: AppColors.textMuted,
              ),
              const SizedBox(height: 20),
              Text(
                'Correo no registrado',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 12),
              Text(
                'Tu correo no está dado de alta. Pide a Mexy que te registre como repartidor.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: AppColors.textSecondary,
                    ),
              ),
              const Spacer(),
              RiderSecondaryButton(
                label: 'Cerrar sesión',
                onPressed: onSignOut,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
