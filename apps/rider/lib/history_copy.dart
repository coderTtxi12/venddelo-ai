const historyEmptyMessage = 'Aún no hay pedidos en este periodo.';

String historyStatusLabel(String status) {
  return switch (status) {
    'delivered' => 'Entregado',
    'cancelled' => 'Cancelado',
    _ => status,
  };
}
