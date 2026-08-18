import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../widgets/rider_widgets.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({
    super.key,
    required this.onGoogleSignIn,
    this.error,
    this.loading = false,
  });

  final VoidCallback? onGoogleSignIn;
  final String? error;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: RiderScreenPadding(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              const Icon(
                Icons.two_wheeler_rounded,
                color: AppColors.primary,
                size: 56,
              ),
              const SizedBox(height: 20),
              Text(
                'Mexy Rider',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 12),
              Text(
                'Entra con el mismo correo con el que Mexy te dio de alta.',
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
                label: loading ? 'Entrando…' : 'Continuar con Google',
                onPressed: loading ? null : onGoogleSignIn,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
