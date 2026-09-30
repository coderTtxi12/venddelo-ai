import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'layout/app_shell.dart';
import 'state/mexy_store.dart';
import 'theme/mexy_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MexyApp());
}

class MexyApp extends StatefulWidget {
  const MexyApp({super.key});

  @override
  State<MexyApp> createState() => _MexyAppState();
}

class _MexyAppState extends State<MexyApp> {
  final _store = MexyStore();

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MexyScope(
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
