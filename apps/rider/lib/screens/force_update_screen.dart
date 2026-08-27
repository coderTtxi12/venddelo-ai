import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_colors.dart';
import '../widgets/rider_widgets.dart';

class ForceUpdateScreen extends StatelessWidget {
  const ForceUpdateScreen({
    super.key,
    this.apkUrl,
    this.launchUrlImpl,
  });

  final String? apkUrl;
  final Future<bool> Function(Uri uri, {LaunchMode mode})? launchUrlImpl;

  String? get _downloadUrl {
    final value = apkUrl?.trim();
    if (value == null || value.isEmpty) return null;
    return value;
  }

  Future<void> _download() async {
    final url = _downloadUrl;
    if (url == null) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    final launch = launchUrlImpl ?? launchUrl;
    await launch(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final url = _downloadUrl;
    return Scaffold(
      body: SafeArea(
        child: RiderScreenPadding(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              const Icon(
                Icons.system_update_alt_rounded,
                color: AppColors.primary,
                size: 56,
              ),
              const SizedBox(height: 20),
              Text(
                'Actualiza la app',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 12),
              Text(
                url == null
                    ? 'Esta versión ya no se puede usar. Pide a Mexy el APK nuevo para seguir recibiendo pedidos.'
                    : 'Esta versión ya no se puede usar. Descarga la actualización para seguir recibiendo pedidos.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: AppColors.textSecondary,
                    ),
              ),
              const Spacer(),
              if (url != null)
                RiderPrimaryButton(
                  label: 'Descargar actualización',
                  onPressed: _download,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
