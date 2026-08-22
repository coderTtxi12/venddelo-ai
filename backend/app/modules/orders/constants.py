ACTIVE_ORDER_STATUSES = ("pending", "confirmed", "preparing", "ready")
ARCHIVE_ORDER_STATUSES = ("delivered", "cancelled")
ALL_ORDER_STATUSES = ACTIVE_ORDER_STATUSES + ARCHIVE_ORDER_STATUSES

KITCHEN_ORDER_VIEWS = frozenset({"active", "archive"})
KITCHEN_ORDER_BOARDS = frozenset({"kitchen", "history"})
KITCHEN_BULK_STATUS_LIMIT = 50
