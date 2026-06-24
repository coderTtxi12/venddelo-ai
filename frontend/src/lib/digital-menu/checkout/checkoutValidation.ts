import type { CheckoutFulfillment } from './fulfillment';

export type CheckoutValidationField = 'customerName' | 'deliveryAddress' | 'paymentMethod';

export type CheckoutValidationIssue = {
  field: CheckoutValidationField;
  message: string;
  sectionId: string;
};

type CheckoutValidationContext = {
  fulfillment: CheckoutFulfillment;
  deliverySelectable: boolean;
  deliveryQuoteLoading: boolean;
  deliveryBlockingReason: string | null;
  showPaymentSection: boolean;
};

export function getCheckoutValidationIssues({
  fulfillment,
  deliverySelectable,
  deliveryQuoteLoading,
  deliveryBlockingReason,
  showPaymentSection,
}: CheckoutValidationContext): CheckoutValidationIssue[] {
  const issues: CheckoutValidationIssue[] = [];

  if (fulfillment.customerName.trim().length < 2) {
    issues.push({
      field: 'customerName',
      message: 'Ingresa tu nombre para continuar',
      sectionId: 'checkout-contact-heading',
    });
  }

  if (fulfillment.serviceType === 'delivery' && deliverySelectable) {
    const hasAddress =
      fulfillment.deliveryAddress.trim().length >= 5 &&
      fulfillment.deliveryLatitude != null &&
      fulfillment.deliveryLongitude != null;

    if (!hasAddress) {
      issues.push({
        field: 'deliveryAddress',
        message: 'Busca tu domicilio y ajusta el pin en el mapa para confirmar la entrega',
        sectionId: 'checkout-address-heading',
      });
    } else if (deliveryQuoteLoading) {
      issues.push({
        field: 'deliveryAddress',
        message: 'Estamos validando la cobertura de entrega, espera un momento',
        sectionId: 'checkout-address-heading',
      });
    } else if (deliveryBlockingReason) {
      issues.push({
        field: 'deliveryAddress',
        message: deliveryBlockingReason,
        sectionId: 'checkout-address-heading',
      });
    } else if (fulfillment.deliveryFeeCents == null) {
      issues.push({
        field: 'deliveryAddress',
        message: 'Confirma tu ubicación en el mapa para calcular el envío',
        sectionId: 'checkout-address-heading',
      });
    }
  }

  if (showPaymentSection && !fulfillment.paymentMethod) {
    issues.push({
      field: 'paymentMethod',
      message: 'Elige cómo te gustaría pagar',
      sectionId: 'checkout-payment-heading',
    });
  }

  return issues;
}

export function checkoutValidationBannerMessage(issues: CheckoutValidationIssue[]): string {
  if (issues.length === 0) return '';
  if (issues.length === 1) return issues[0]!.message;

  const labels = issues.map((issue) => {
    switch (issue.field) {
      case 'customerName':
        return 'tu nombre';
      case 'deliveryAddress':
        return 'tu dirección de entrega';
      case 'paymentMethod':
        return 'un método de pago';
      default:
        return 'un campo';
    }
  });

  return `Falta completar: ${labels.join(', ')}`;
}

export function checkoutFieldHasIssue(
  issues: CheckoutValidationIssue[],
  field: CheckoutValidationField,
): boolean {
  return issues.some((issue) => issue.field === field);
}
