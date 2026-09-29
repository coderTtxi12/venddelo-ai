import 'package:flutter/material.dart';

import '../state/owner_store.dart';
import '../theme/mexy_theme.dart';
import '../features/delivery/delivery_screen.dart';
import '../features/orders/orders_screen.dart';
import '../features/printer/printer_screen.dart';
import '../features/settings/settings_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  static const _destinations = [
    _Destination('Órdenes', Icons.receipt_long_outlined, Icons.receipt_long),
    _Destination('Impresora', Icons.print_outlined, Icons.print),
    _Destination('Envíos', Icons.delivery_dining_outlined, Icons.delivery_dining),
    _Destination('Ajustes', Icons.settings_outlined, Icons.settings),
  ];

  @override
  Widget build(BuildContext context) {
    final store = OwnerScope.of(context);
    final scheme = Theme.of(context).colorScheme;
    final compact = context.isCompact;
    final extendRail = context.windowWidth >= 1080;

    final pages = const [
      OrdersScreen(),
      PrinterScreen(),
      DeliveryScreen(),
      SettingsScreen(),
    ];

    Widget railIcon(int index, bool selected) {
      final icon = Icon(selected ? _destinations[index].selected : _destinations[index].icon);
      if (index != 0 || store.pendingCount == 0) return icon;
      return Badge(
        label: Text('${store.pendingCount}'),
        child: icon,
      );
    }

    final rail = NavigationRail(
      extended: extendRail,
      minExtendedWidth: 220,
      groupAlignment: -1,
      selectedIndex: _index,
      onDestinationSelected: (index) => setState(() => _index = index),
      leading: Padding(
        padding: EdgeInsets.fromLTRB(extendRail ? 12 : 0, 12, extendRail ? 12 : 0, 16),
        child: _BrandMark(extended: extendRail),
      ),
      labelType: extendRail ? NavigationRailLabelType.none : NavigationRailLabelType.all,
      destinations: [
        for (var i = 0; i < _destinations.length; i++)
          NavigationRailDestination(
            icon: railIcon(i, false),
            selectedIcon: railIcon(i, true),
            label: Text(_destinations[i].label),
            padding: const EdgeInsets.symmetric(vertical: 4),
          ),
      ],
    );

    final body = IndexedStack(index: _index, children: pages);

    if (compact) {
      return Scaffold(
        body: SafeArea(bottom: false, child: body),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (index) => setState(() => _index = index),
          destinations: [
            for (var i = 0; i < _destinations.length; i++)
              NavigationDestination(
                icon: railIcon(i, false),
                selectedIcon: railIcon(i, true),
                label: _destinations[i].label,
              ),
          ],
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: Row(
          children: [
            rail,
            VerticalDivider(width: 1, color: scheme.outlineVariant),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

class _Destination {
  const _Destination(this.label, this.icon, this.selected);

  final String label;
  final IconData icon;
  final IconData selected;
}

class _BrandMark extends StatelessWidget {
  const _BrandMark({required this.extended});

  final bool extended;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final mark = Semantics(
      label: 'Mexy',
      child: Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: scheme.primary,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          'M',
          style: TextStyle(
            color: scheme.onPrimary,
            fontWeight: FontWeight.w800,
            fontSize: 18,
          ),
        ),
      ),
    );
    if (!extended) return mark;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        mark,
        const SizedBox(width: MexySpace.md),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Mexy', style: Theme.of(context).textTheme.titleMedium),
            Text('Tu restaurante', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ],
    );
  }
}
