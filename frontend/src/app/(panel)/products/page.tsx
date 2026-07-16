import { Suspense } from 'react';
import ProductsPage from '@/components/pages/ProductsPage';

export default function ProductsRoute() {
  return (
    <Suspense fallback={null}>
      <ProductsPage />
    </Suspense>
  );
}
