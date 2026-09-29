import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'layout/app_shell.dart';
import 'state/owner_store.dart';
import 'theme/mexy_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MexyOwnerApp());
}

class MexyOwnerApp extends StatefulWidget {
  const MexyOwnerApp({super.key});

  @override
  State<MexyOwnerApp> createState() => _MexyOwnerAppState();
}

class _MexyOwnerAppState extends State<MexyOwnerApp> {
  final _store = OwnerStore();

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return OwnerScope(
      store: _store,
      child: MaterialApp(
        title: 'Mexy',
        debugShowCheckedModeBanner: false,
        locale: const Locale('es', 'MX'),
        supportedLocales: const [Locale('es', 'MX'), Locale('es')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: MexyTheme.light(),
        darkTheme: MexyTheme.dark(),
        home: const AppShell(),
      ),
    );
  }
}
