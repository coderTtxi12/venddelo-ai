import { apiRequest } from './client';

export type AnalyticsGranularity = 'daily' | 'weekly' | 'monthly';

export type AnalyticsPeriod = {
  granularity: AnalyticsGranularity;
  timezone: string;
  start: string;
  end: string;
  comparison_start: string;
  comparison_end: string;
  label: string;
};

export type AnalyticsSummary = {
  total_revenue_cents: number;
  order_count: number;
  avg_order_cents: number;
  total_discount_cents: number;
  cancelled_count: number;
  cancellation_rate_pct: number;
  pending_orders: number;
  revenue_change_pct: number | null;
  order_count_change_pct: number | null;
  avg_order_change_pct: number | null;
};

export type AnalyticsSalesPoint = {
  bucket_start: string;
  label: string;
  revenue_cents: number;
  order_count: number;
};

export type AnalyticsTopProduct = {
  product_id: string | null;
  product_name: string;
  quantity: number;
  revenue_cents: number;
};

export type AnalyticsTopCustomer = {
  customer_name: string;
  customer_phone: string;
  order_count: number;
  total_spent_cents: number;
};

export type AnalyticsPromotionUsage = {
  promotion_id: string | null;
  promotion_name: string;
  usage_count: number;
  discount_cents: number;
  effective_status: string | null;
};

export type AnalyticsOrderTypeBreakdown = {
  order_type: string;
  count: number;
  revenue_cents: number;
};

export type AnalyticsPaymentMethodBreakdown = {
  payment_method: string;
  count: number;
  revenue_cents: number;
};

export type AnalyticsCustomerStats = {
  unique_customers: number;
  repeat_customers: number;
  repeat_customer_pct: number;
  new_customers: number;
};

export type AnalyticsDashboard = {
  period: AnalyticsPeriod;
  summary: AnalyticsSummary;
  sales_series: AnalyticsSalesPoint[];
  top_products: AnalyticsTopProduct[];
  top_customers: AnalyticsTopCustomer[];
  promotion_usage: AnalyticsPromotionUsage[];
  order_types: AnalyticsOrderTypeBreakdown[];
  payment_methods: AnalyticsPaymentMethodBreakdown[];
  customer_stats: AnalyticsCustomerStats;
};

export function getRestaurantAnalytics(
  token: string,
  restaurantId: string,
  granularity: AnalyticsGranularity = 'monthly',
) {
  const params = new URLSearchParams({ granularity });
  return apiRequest<AnalyticsDashboard>(
    `/restaurants/${restaurantId}/analytics?${params}`,
    { token },
  );
}
