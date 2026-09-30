import 'package:flutter/widgets.dart';

enum OrderStatus { pending, confirmed, preparing, ready, delivered, cancelled }

enum OrderType { takeout, delivery }

enum DispatchStatus { searching, assigned, enRoute, delivered, cancelled }

enum PrinterKind { bluetooth, usb, network }

class OrderItem {
  const OrderItem({
    required this.name,
    required this.quantity,
    required this.unitCents,
    this.options = const [],
  });

  final String name;
  final int quantity;
  final int unitCents;
  final List<String> options;

  int get lineCents => unitCents * quantity;
}

class KitchenOrder {
  const KitchenOrder({
    required this.id,
    required this.displayId,
    required this.customerName,
    required this.phone,
    required this.type,
    required this.status,
    required this.createdAt,
    required this.items,
    required this.paymentLabel,
    this.address,
    this.note,
  });

  final String id;
  final String displayId;
  final String customerName;
  final String phone;
  final OrderType type;
  final OrderStatus status;
  final DateTime createdAt;
  final List<OrderItem> items;
  final String paymentLabel;
  final String? address;
  final String? note;

  int get totalCents => items.fold(0, (sum, item) => sum + item.lineCents);

  int get itemCount => items.fold(0, (sum, item) => sum + item.quantity);

  KitchenOrder copyWith({OrderStatus? status}) {
    return KitchenOrder(
      id: id,
      displayId: displayId,
      customerName: customerName,
      phone: phone,
      type: type,
      status: status ?? this.status,
      createdAt: createdAt,
      items: items,
      paymentLabel: paymentLabel,
      address: address,
      note: note,
    );
  }
}

class OrderStatusMeta {
  const OrderStatusMeta({
    required this.shortLabel,
    required this.label,
    required this.next,
    required this.nextAction,
  });

  final String shortLabel;
  final String label;
  final OrderStatus? next;
  final String? nextAction;
}

const orderStatusMeta = <OrderStatus, OrderStatusMeta>{
  OrderStatus.pending: OrderStatusMeta(
    shortLabel: 'Nuevo',
    label: 'Pendiente',
    next: OrderStatus.confirmed,
    nextAction: 'Confirmar',
  ),
  OrderStatus.confirmed: OrderStatusMeta(
    shortLabel: 'Confirmado',
    label: 'Confirmado',
    next: OrderStatus.preparing,
    nextAction: 'Preparar',
  ),
  OrderStatus.preparing: OrderStatusMeta(
    shortLabel: 'Cocina',
    label: 'En preparación',
    next: OrderStatus.ready,
    nextAction: 'Marcar listo',
  ),
  OrderStatus.ready: OrderStatusMeta(
    shortLabel: 'Listo',
    label: 'Listo',
    next: OrderStatus.delivered,
    nextAction: 'Entregado',
  ),
  OrderStatus.delivered: OrderStatusMeta(
    shortLabel: 'Entregado',
    label: 'Entregado',
    next: null,
    nextAction: null,
  ),
  OrderStatus.cancelled: OrderStatusMeta(
    shortLabel: 'Cancelado',
    label: 'Cancelado',
    next: null,
    nextAction: null,
  ),
};

enum OrderFilter { news, confirmed, preparing, ready, delivered, cancelled, active, all }

extension OrderFilterLabel on OrderFilter {
  String get label {
    switch (this) {
      case OrderFilter.news:
        return 'Nuevos';
      case OrderFilter.confirmed:
        return 'Confirmados';
      case OrderFilter.preparing:
        return 'Preparando';
      case OrderFilter.ready:
        return 'Listos';
      case OrderFilter.delivered:
        return 'Entregados';
      case OrderFilter.cancelled:
        return 'Cancelados';
      case OrderFilter.active:
        return 'Activos';
      case OrderFilter.all:
        return 'Todos';
    }
  }
}

bool matchesFilter(OrderStatus status, OrderFilter filter) {
  switch (filter) {
    case OrderFilter.news:
      return status == OrderStatus.pending;
    case OrderFilter.confirmed:
      return status == OrderStatus.confirmed;
    case OrderFilter.preparing:
      return status == OrderStatus.preparing;
    case OrderFilter.ready:
      return status == OrderStatus.ready;
    case OrderFilter.delivered:
      return status == OrderStatus.delivered;
    case OrderFilter.cancelled:
      return status == OrderStatus.cancelled;
    case OrderFilter.active:
      return status != OrderStatus.delivered && status != OrderStatus.cancelled;
    case OrderFilter.all:
      return true;
  }
}

bool canCancelOrder(OrderStatus status) {
  return status != OrderStatus.delivered && status != OrderStatus.cancelled;
}

class PrinterDevice {
  const PrinterDevice({
    required this.id,
    required this.name,
    required this.kind,
    this.detail,
  });

  final String id;
  final String name;
  final PrinterKind kind;
  final String? detail;

  String get kindLabel {
    switch (kind) {
      case PrinterKind.bluetooth:
        return 'Bluetooth';
      case PrinterKind.usb:
        return 'USB';
      case PrinterKind.network:
        return 'Wi-Fi / Ethernet';
    }
  }
}

class TicketSettings {
  const TicketSettings({
    this.paperWidthMm = 80,
    this.copies = 1,
    this.brandName = '',
    this.showAddress = true,
    this.showCustomer = true,
    this.showItems = true,
    this.showTotal = true,
    this.footer = 'Gracias por tu pedido',
    this.autoPrint = false,
  });

  final int paperWidthMm;
  final int copies;
  final String brandName;
  final bool showAddress;
  final bool showCustomer;
  final bool showItems;
  final bool showTotal;
  final String footer;
  final bool autoPrint;

  TicketSettings copyWith({
    int? paperWidthMm,
    int? copies,
    String? brandName,
    bool? showAddress,
    bool? showCustomer,
    bool? showItems,
    bool? showTotal,
    String? footer,
    bool? autoPrint,
  }) {
    return TicketSettings(
      paperWidthMm: paperWidthMm ?? this.paperWidthMm,
      copies: copies ?? this.copies,
      brandName: brandName ?? this.brandName,
      showAddress: showAddress ?? this.showAddress,
      showCustomer: showCustomer ?? this.showCustomer,
      showItems: showItems ?? this.showItems,
      showTotal: showTotal ?? this.showTotal,
      footer: footer ?? this.footer,
      autoPrint: autoPrint ?? this.autoPrint,
    );
  }
}

class DispatchRequest {
  const DispatchRequest({
    required this.id,
    required this.shortId,
    required this.customerName,
    required this.phone,
    required this.address,
    required this.prepMinutes,
    required this.collectCents,
    required this.status,
    required this.createdAt,
    this.cashConfirmed = false,
  });

  final String id;
  final String shortId;
  final String customerName;
  final String phone;
  final String address;
  final int prepMinutes;
  final int collectCents;
  final DispatchStatus status;
  final DateTime createdAt;
  final bool cashConfirmed;

  bool get isHistory =>
      status == DispatchStatus.delivered || status == DispatchStatus.cancelled;

  DispatchRequest copyWith({
    DispatchStatus? status,
    bool? cashConfirmed,
  }) {
    return DispatchRequest(
      id: id,
      shortId: shortId,
      customerName: customerName,
      phone: phone,
      address: address,
      prepMinutes: prepMinutes,
      collectCents: collectCents,
      status: status ?? this.status,
      createdAt: createdAt,
      cashConfirmed: cashConfirmed ?? this.cashConfirmed,
    );
  }
}

class DayHours {
  const DayHours({
    required this.weekday,
    required this.label,
    required this.open,
    this.openMinutes = 11 * 60,
    this.closeMinutes = 22 * 60,
  });

  final int weekday;
  final String label;
  final bool open;
  final int openMinutes;
  final int closeMinutes;

  DayHours copyWith({bool? open, int? openMinutes, int? closeMinutes}) {
    return DayHours(
      weekday: weekday,
      label: label,
      open: open ?? this.open,
      openMinutes: openMinutes ?? this.openMinutes,
      closeMinutes: closeMinutes ?? this.closeMinutes,
    );
  }
}

class PaymentChoices {
  const PaymentChoices({
    this.takeoutCash = true,
    this.takeoutTransfer = true,
    this.takeoutCard = true,
    this.deliveryCash = true,
    this.deliveryTransfer = false,
    this.deliveryCard = true,
  });

  final bool takeoutCash;
  final bool takeoutTransfer;
  final bool takeoutCard;
  final bool deliveryCash;
  final bool deliveryTransfer;
  final bool deliveryCard;

  PaymentChoices copyWith({
    bool? takeoutCash,
    bool? takeoutTransfer,
    bool? takeoutCard,
    bool? deliveryCash,
    bool? deliveryTransfer,
    bool? deliveryCard,
  }) {
    return PaymentChoices(
      takeoutCash: takeoutCash ?? this.takeoutCash,
      takeoutTransfer: takeoutTransfer ?? this.takeoutTransfer,
      takeoutCard: takeoutCard ?? this.takeoutCard,
      deliveryCash: deliveryCash ?? this.deliveryCash,
      deliveryTransfer: deliveryTransfer ?? this.deliveryTransfer,
      deliveryCard: deliveryCard ?? this.deliveryCard,
    );
  }
}

class StaffMember {
  const StaffMember({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
  });

  final String id;
  final String name;
  final String email;
  final String role;
}

class RestaurantProfile {
  const RestaurantProfile({
    required this.name,
    required this.subdomain,
    required this.description,
    required this.whatsapp,
    required this.address,
    required this.takeoutEnabled,
    required this.deliveryEnabled,
    required this.payments,
    required this.hours,
    required this.staff,
  });

  final String name;
  final String subdomain;
  final String description;
  final String whatsapp;
  final String address;
  final bool takeoutEnabled;
  final bool deliveryEnabled;
  final PaymentChoices payments;
  final List<DayHours> hours;
  final List<StaffMember> staff;

  RestaurantProfile copyWith({
    String? name,
    String? subdomain,
    String? description,
    String? whatsapp,
    String? address,
    bool? takeoutEnabled,
    bool? deliveryEnabled,
    PaymentChoices? payments,
    List<DayHours>? hours,
    List<StaffMember>? staff,
  }) {
    return RestaurantProfile(
      name: name ?? this.name,
      subdomain: subdomain ?? this.subdomain,
      description: description ?? this.description,
      whatsapp: whatsapp ?? this.whatsapp,
      address: address ?? this.address,
      takeoutEnabled: takeoutEnabled ?? this.takeoutEnabled,
      deliveryEnabled: deliveryEnabled ?? this.deliveryEnabled,
      payments: payments ?? this.payments,
      hours: hours ?? this.hours,
      staff: staff ?? this.staff,
    );
  }
}

String formatPesos(int cents) {
  final negative = cents < 0;
  final abs = cents.abs();
  final pesos = abs ~/ 100;
  final fraction = (abs % 100).toString().padLeft(2, '0');
  final digits = pesos.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
    buffer.write(digits[i]);
  }
  return '${negative ? '-' : ''}\$$buffer.$fraction';
}

String formatElapsed(DateTime created, DateTime now) {
  final minutes = now.difference(created).inMinutes;
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return 'hace $minutes min';
  final hours = minutes ~/ 60;
  if (hours < 24) return 'hace $hours h';
  return 'hace ${hours ~/ 24} d';
}

String formatClock(int minutes) {
  final hour = (minutes ~/ 60) % 24;
  final minute = minutes % 60;
  final suffix = hour < 12 ? 'a.m.' : 'p.m.';
  final hour12 = hour % 12 == 0 ? 12 : hour % 12;
  return '$hour12:${minute.toString().padLeft(2, '0')} $suffix';
}

String? validateSubdomain(String value) {
  final trimmed = value.trim().toLowerCase();
  if (trimmed.isEmpty) return 'Escribe un subdominio.';
  if (trimmed.length < 3) return 'Usa al menos 3 caracteres.';
  if (!RegExp(r'^[a-z0-9]+(?:-[a-z0-9]+)*$').hasMatch(trimmed)) {
    return 'Solo minúsculas, números y guiones.';
  }
  return null;
}

String? validateWhatsapp(String value) {
  final digits = value.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return 'Escribe el WhatsApp de pedidos.';
  if (digits.length != 10) return 'El celular debe tener 10 dígitos.';
  return null;
}

class OwnerStore extends ChangeNotifier {
  OwnerStore({DateTime? now}) : _now = now ?? DateTime.now() {
    _orders = _seedOrders(_now);
    _requests = _seedRequests(_now);
  }

  final DateTime _now;
  late List<KitchenOrder> _orders;
  late List<DispatchRequest> _requests;
  int _sequence = 40;

  RestaurantProfile profile = RestaurantProfile(
    name: 'Taquería El Centro',
    subdomain: 'tacos-centro',
    description: 'Tacos al pastor, gringas y aguas frescas en el centro de Guadalajara.',
    whatsapp: '3315550198',
    address: 'Av. Juárez 120, Centro, Guadalajara, Jalisco',
    takeoutEnabled: true,
    deliveryEnabled: true,
    payments: const PaymentChoices(),
    hours: const [
      DayHours(weekday: 1, label: 'Lunes', open: true),
      DayHours(weekday: 2, label: 'Martes', open: true),
      DayHours(weekday: 3, label: 'Miércoles', open: true),
      DayHours(weekday: 4, label: 'Jueves', open: true),
      DayHours(weekday: 5, label: 'Viernes', open: true, closeMinutes: 23 * 60),
      DayHours(weekday: 6, label: 'Sábado', open: true, openMinutes: 12 * 60, closeMinutes: 23 * 60),
      DayHours(weekday: 7, label: 'Domingo', open: false),
    ],
    staff: const [
      StaffMember(
        id: 'owner',
        name: 'Valeria Cruz',
        email: 'valeria@tacos-centro.mx',
        role: 'Propietaria',
      ),
      StaffMember(
        id: 'floor',
        name: 'Hugo Mendoza',
        email: 'hugo@tacos-centro.mx',
        role: 'Admin',
      ),
    ],
  );

  PrinterDevice? printer;
  TicketSettings ticket = const TicketSettings(brandName: 'Taquería El Centro');

  List<KitchenOrder> get orders => List.unmodifiable(_orders);

  List<DispatchRequest> get requests => List.unmodifiable(_requests);

  int get pendingCount =>
      _orders.where((order) => order.status == OrderStatus.pending).length;

  KitchenOrder? orderById(String id) {
    for (final order in _orders) {
      if (order.id == id) return order;
    }
    return null;
  }

  int countFor(OrderFilter filter) =>
      _orders.where((order) => matchesFilter(order.status, filter)).length;

  /// Returns a message when an automatic ticket should be mentioned.
  String? advance(String id) {
    final index = _orders.indexWhere((order) => order.id == id);
    if (index < 0) return null;
    final order = _orders[index];
    final next = orderStatusMeta[order.status]?.next;
    if (next == null) return null;
    _orders[index] = order.copyWith(status: next);
    notifyListeners();
    final autoTakeout = ticket.autoPrint &&
        printer != null &&
        order.type == OrderType.takeout &&
        order.status == OrderStatus.pending &&
        next == OrderStatus.confirmed;
    if (autoTakeout) {
      return 'Pedido confirmado. Ticket enviado a ${printer!.name}.';
    }
    return null;
  }

  void cancelOrder(String id) {
    final index = _orders.indexWhere((order) => order.id == id);
    if (index < 0) return;
    if (!canCancelOrder(_orders[index].status)) return;
    _orders[index] = _orders[index].copyWith(status: OrderStatus.cancelled);
    notifyListeners();
  }

  void selectPrinter(PrinterDevice? device) {
    printer = device;
    if (device == null) {
      ticket = ticket.copyWith(autoPrint: false);
    }
    notifyListeners();
  }

  void updateTicket(TicketSettings next) {
    ticket = next;
    notifyListeners();
  }

  DispatchRequest? addDispatch({
    required String customerName,
    required String phone,
    required String address,
    required int prepMinutes,
    required int collectCents,
  }) {
    if (!profile.deliveryEnabled) return null;
    _sequence += 1;
    final request = DispatchRequest(
      id: 'dispatch-$_sequence',
      shortId: 'E$_sequence',
      customerName: customerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      prepMinutes: prepMinutes,
      collectCents: collectCents,
      status: DispatchStatus.searching,
      createdAt: DateTime.now(),
    );
    _requests = [request, ..._requests];
    notifyListeners();
    return request;
  }

  void cancelDispatch(String id) {
    _requests = [
      for (final request in _requests)
        if (request.id == id && !request.isHistory)
          request.copyWith(status: DispatchStatus.cancelled)
        else
          request,
    ];
    notifyListeners();
  }

  void confirmCash(String id) {
    _requests = [
      for (final request in _requests)
        if (request.id == id) request.copyWith(cashConfirmed: true) else request,
    ];
    notifyListeners();
  }

  void saveProfile(RestaurantProfile next) {
    profile = next;
    if (ticket.brandName.trim().isEmpty) {
      ticket = ticket.copyWith(brandName: next.name);
    }
    notifyListeners();
  }

  void inviteStaff(String email) {
    final trimmed = email.trim().toLowerCase();
    if (trimmed.isEmpty) return;
    final name = trimmed.split('@').first;
    final pretty = name.isEmpty
        ? 'Nuevo admin'
        : '${name[0].toUpperCase()}${name.substring(1)}';
    profile = profile.copyWith(
      staff: [
        ...profile.staff,
        StaffMember(
          id: 'invite-${profile.staff.length + 1}',
          name: pretty,
          email: trimmed,
          role: 'Invitación enviada',
        ),
      ],
    );
    notifyListeners();
  }

  void removeStaff(String id) {
    profile = profile.copyWith(
      staff: profile.staff.where((member) => member.id != id || member.id == 'owner').toList(),
    );
    notifyListeners();
  }
}

List<KitchenOrder> _seedOrders(DateTime now) {
  return [
    KitchenOrder(
      id: 'ord-1842',
      displayId: '1842',
      customerName: 'Mariana Solís',
      phone: '33 1555 0142',
      type: OrderType.delivery,
      status: OrderStatus.pending,
      createdAt: now.subtract(const Duration(minutes: 4)),
      paymentLabel: 'Efectivo',
      address: 'Calle Morelos 88, Col. Americana',
      note: 'Sin cebolla en el pastor.',
      items: const [
        OrderItem(name: 'Taco al pastor', quantity: 4, unitCents: 2800, options: ['Con piña']),
        OrderItem(name: 'Gringa', quantity: 1, unitCents: 7500),
        OrderItem(name: 'Agua de horchata', quantity: 2, unitCents: 3500),
      ],
    ),
    KitchenOrder(
      id: 'ord-1841',
      displayId: '1841',
      customerName: 'Luis Herrera',
      phone: '33 1555 0177',
      type: OrderType.takeout,
      status: OrderStatus.pending,
      createdAt: now.subtract(const Duration(minutes: 9)),
      paymentLabel: 'Terminal',
      items: const [
        OrderItem(name: 'Taco de suadero', quantity: 5, unitCents: 3000),
        OrderItem(name: 'Quesadilla de chicharrón', quantity: 1, unitCents: 6500),
      ],
    ),
    KitchenOrder(
      id: 'ord-1838',
      displayId: '1838',
      customerName: 'Sofía Ramírez',
      phone: '33 1555 0104',
      type: OrderType.delivery,
      status: OrderStatus.confirmed,
      createdAt: now.subtract(const Duration(minutes: 18)),
      paymentLabel: 'Transferencia',
      address: 'Av. México 540, Lafayette',
      items: const [
        OrderItem(name: 'Volcán de bistec', quantity: 2, unitCents: 8200),
        OrderItem(name: 'Agua de jamaica', quantity: 1, unitCents: 3500),
      ],
    ),
    KitchenOrder(
      id: 'ord-1833',
      displayId: '1833',
      customerName: 'Diego Navarro',
      phone: '33 1555 0190',
      type: OrderType.takeout,
      status: OrderStatus.preparing,
      createdAt: now.subtract(const Duration(minutes: 27)),
      paymentLabel: 'Efectivo',
      items: const [
        OrderItem(name: 'Orden de pastor', quantity: 1, unitCents: 14500, options: ['Tortilla de harina']),
        OrderItem(name: 'Guacamole', quantity: 1, unitCents: 4500),
      ],
    ),
    KitchenOrder(
      id: 'ord-1829',
      displayId: '1829',
      customerName: 'Camila Ortiz',
      phone: '33 1555 0128',
      type: OrderType.delivery,
      status: OrderStatus.ready,
      createdAt: now.subtract(const Duration(minutes: 41)),
      paymentLabel: 'Terminal',
      address: 'Prisciliano Sánchez 214, Centro',
      items: const [
        OrderItem(name: 'Gringa', quantity: 2, unitCents: 7500),
        OrderItem(name: 'Taco de tripa', quantity: 3, unitCents: 3200),
      ],
    ),
    KitchenOrder(
      id: 'ord-1810',
      displayId: '1810',
      customerName: 'Pedro Ruiz',
      phone: '33 1555 0166',
      type: OrderType.takeout,
      status: OrderStatus.delivered,
      createdAt: now.subtract(const Duration(hours: 2)),
      paymentLabel: 'Efectivo',
      items: const [
        OrderItem(name: 'Taco al pastor', quantity: 3, unitCents: 2800),
      ],
    ),
    KitchenOrder(
      id: 'ord-1804',
      displayId: '1804',
      customerName: 'Ana Beltrán',
      phone: '33 1555 0111',
      type: OrderType.delivery,
      status: OrderStatus.cancelled,
      createdAt: now.subtract(const Duration(hours: 5)),
      paymentLabel: 'Efectivo',
      address: 'Calle Independencia 40',
      items: const [
        OrderItem(name: 'Quesadilla de champiñones', quantity: 2, unitCents: 6000),
      ],
    ),
  ];
}

List<DispatchRequest> _seedRequests(DateTime now) {
  return [
    DispatchRequest(
      id: 'dispatch-32',
      shortId: 'E32',
      customerName: 'Elena Vargas',
      phone: '33 1555 0201',
      address: 'Calle Marsella 67, Americana',
      prepMinutes: 15,
      collectCents: 18600,
      status: DispatchStatus.searching,
      createdAt: now.subtract(const Duration(minutes: 6)),
    ),
    DispatchRequest(
      id: 'dispatch-31',
      shortId: 'E31',
      customerName: 'Jorge Medina',
      phone: '33 1555 0188',
      address: 'Av. Chapultepec 190',
      prepMinutes: 20,
      collectCents: 0,
      status: DispatchStatus.assigned,
      createdAt: now.subtract(const Duration(minutes: 22)),
    ),
    DispatchRequest(
      id: 'dispatch-28',
      shortId: 'E28',
      customerName: 'Paula Cruz',
      phone: '33 1555 0133',
      address: 'Calle Libertad 12, Centro',
      prepMinutes: 10,
      collectCents: 9400,
      status: DispatchStatus.delivered,
      createdAt: now.subtract(const Duration(hours: 3)),
      cashConfirmed: true,
    ),
  ];
}

class OwnerScope extends InheritedNotifier<OwnerStore> {
  const OwnerScope({
    required OwnerStore store,
    required super.child,
    super.key,
  }) : super(notifier: store);

  static OwnerStore of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<OwnerScope>();
    assert(scope != null, 'OwnerScope no está en el árbol.');
    return scope!.notifier!;
  }
}
