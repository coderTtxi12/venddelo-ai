import 'package:flutter/material.dart';

import '../legal/rider_legal_urls.dart';
import '../screens/legal_webview_screen.dart';
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

  void _openLegal(BuildContext context, {required String title, required String url}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => LegalWebViewScreen(title: title, url: url),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final linkStyle = Theme.of(context).textTheme.bodySmall?.copyWith(
          color: AppColors.primary,
          fontWeight: FontWeight.w600,
          decoration: TextDecoration.underline,
          decorationColor: AppColors.primary,
        );
    final baseStyle = Theme.of(context).textTheme.bodySmall?.copyWith(
          color: AppColors.textSecondary,
          height: 1.35,
        );

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
              const SizedBox(height: 16),
              Text.rich(
                TextSpan(
                  style: baseStyle,
                  children: [
                    const TextSpan(text: 'Al continuar con Google aceptas los '),
                    WidgetSpan(
                      alignment: PlaceholderAlignment.baseline,
                      baseline: TextBaseline.alphabetic,
                      child: GestureDetector(
                        onTap: () => _openLegal(
                          context,
                          title: 'Términos y Condiciones',
                          url: RiderLegalUrls.terms,
                        ),
                        child: Text('Términos y Condiciones', style: linkStyle),
                      ),
                    ),
                    const TextSpan(text: ' y la '),
                    WidgetSpan(
                      alignment: PlaceholderAlignment.baseline,
                      baseline: TextBaseline.alphabetic,
                      child: GestureDetector(
                        onTap: () => _openLegal(
                          context,
                          title: 'Política de Privacidad',
                          url: RiderLegalUrls.privacy,
                        ),
                        child: Text('Política de Privacidad', style: linkStyle),
                      ),
                    ),
                    const TextSpan(text: '.'),
                  ],
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
