import 'package:flutter/material.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key, required this.onGoogleSignIn, this.error});

  final VoidCallback? onGoogleSignIn;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Text(
                'Mexy Rider',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 12),
              Text(
                'Entra con el mismo correo que Mexy dio de alta.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const Spacer(),
              if (error != null) ...[
                Semantics(
                  liveRegion: true,
                  child: Text(
                    error!,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              FilledButton(
                onPressed: onGoogleSignIn,
                child: const Text('Continuar con Google'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
