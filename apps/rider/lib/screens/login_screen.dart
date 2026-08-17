import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../widgets/rider_widgets.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key, required this.onGoogleSignIn, this.error});

  final VoidCallback? onGoogleSignIn;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: RiderScreenPadding(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Container(
                width: 72,
                height: 72,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(
                  Icons.two_wheeler_rounded,
                  color: Colors.white,
                  size: 36,
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Mexy Rider',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 12),
              Text(
                'Entra con el mismo correo que Mexy dio de alta.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: AppColors.textSecondary,
                    ),
              ),
              const Spacer(),
              if (error != null) ...[
                RiderErrorBanner(message: error!),
                const SizedBox(height: 16),
              ],
              RiderPrimaryButton(
                label: 'Continuar con Google',
                onPressed: onGoogleSignIn,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
