'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent } from 'react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import { getPublicCheckoutConfig, type PublicCheckoutConfig } from '@/lib/api/public';
import {
  checkoutFieldHasIssue,
  checkoutValidationBannerMessage,
  getCheckoutValidationIssues,
  type CheckoutValidationIssue,
} from '@/lib/digital-menu/checkout/checkoutValidation';
import {
  enabledPaymentMethodsForService,
  EMPTY_DELIVERY_LOCATION,
  isFulfillmentComplete,
  reconcileCheckoutFulfillment,
  resolveAvailableServices,
  resolveCheckoutFulfillmentFromPreferences,
  type CheckoutFulfillment,
} from '@/lib/digital-menu/checkout/fulfillment';
import {
  readCheckoutPreferencesFromStorage,
} from '@/lib/digital-menu/checkout/preferencesStorage';
import { usePublicDeliveryQuote } from '@/lib/digital-menu/checkout/usePublicDeliveryQuote';
import { getDeliveryWeatherNotice } from '@/lib/digital-menu/checkout/deliveryWeatherNotice';
import { formatMoney } from '@/lib/currency';
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethodKey,
} from '@/lib/restaurantPaymentConfig';
import {
  RESTAURANT_SERVICE_LABELS,
  type RestaurantServiceType,
} from '@/lib/restaurantServices';
import menuStyles from '@/components/pages/DigitalMenuPage.module.css';
import { PhoneInputWithCountry } from '@/components/onboarding/PhoneInputWithCountry';
import { CheckoutDeliveryAddressPicker } from './CheckoutDeliveryAddressPicker';
import styles from './PublicMenuCheckoutDetails.module.css';

const SERVICE_ICONS: Record<RestaurantServiceType, ComponentType<SvgIconProps>> = {
  takeout: StorefrontOutlinedIcon,
  delivery: BoltOutlinedIcon,
};

const PAYMENT_ICONS: Record<PaymentMethodKey, typeof PaymentsOutlinedIcon> = {
  cash: PaymentsOutlinedIcon,
  transfer: SwapHorizOutlinedIcon,
  card_terminal: CreditCardOutlinedIcon,
};

const PAYMENT_HINTS: Record<PaymentMethodKey, string> = {
  cash: 'Paga al recibir tu pedido',
  transfer: 'Transferencia bancaria',
  card_terminal: 'Pago con terminal en entrega o recogida',
};

type PublicMenuCheckoutDetailsProps = {
  subdomain: string;
  fulfillment: CheckoutFulfillment;
  onFulfillmentChange: (next: CheckoutFulfillment) => void;
  onBack: () => void;
  onContinue: () => void;
  currency: string;
  isTabletLayout?: boolean;
};

export function PublicMenuCheckoutDetails({
  subdomain,
  fulfillment,
  onFulfillmentChange,
  onBack,
  onContinue,
  currency,
  isTabletLayout = false,
}: PublicMenuCheckoutDetailsProps) {
  const [config, setConfig] = useState<PublicCheckoutConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addressTouched, setAddressTouched] = useState(false);
  const [customerTouched, setCustomerTouched] = useState(false);
  const [customerPhoneTouched, setCustomerPhoneTouched] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [continueBtnAttention, setContinueBtnAttention] = useState(false);
  const preferencesHydratedRef = useRef(false);
  const validationScrollTimerRef = useRef<number | null>(null);
  const sectionRefs = useRef<Partial<Record<string, HTMLElement | null>>>({});

  const persistFulfillment = (next: CheckoutFulfillment) => {
    onFulfillmentChange(next);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void getPublicCheckoutConfig(subdomain)
      .then((result) => {
        if (!cancelled) setConfig(result);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('No se pudo cargar las opciones de entrega y pago.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  useEffect(() => {
    if (!config) return;
    const services = resolveAvailableServices(config);
    if (services.length === 0) return;

    if (!preferencesHydratedRef.current) {
      preferencesHydratedRef.current = true;
      const saved = readCheckoutPreferencesFromStorage(subdomain);
      const resolved = resolveCheckoutFulfillmentFromPreferences(config, saved);
      persistFulfillment(resolved);
      return;
    }

    const reconciled = reconcileCheckoutFulfillment(config, fulfillment);
    if (
      reconciled.serviceType !== fulfillment.serviceType ||
      reconciled.paymentMethod !== fulfillment.paymentMethod ||
      reconciled.deliveryAddress !== fulfillment.deliveryAddress ||
      reconciled.deliveryLatitude !== fulfillment.deliveryLatitude ||
      reconciled.deliveryLongitude !== fulfillment.deliveryLongitude ||
      reconciled.deliveryPlaceId !== fulfillment.deliveryPlaceId
    ) {
      persistFulfillment(reconciled);
    }
    // Sync saved preferences and validate against checkout config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, subdomain]);

  const availableServices = useMemo(
    () => (config ? resolveAvailableServices(config) : []),
    [config],
  );

  const deliveryServiceAvailable = config?.delivery_service?.available ?? false;
  const deliveryServiceReason = config?.delivery_service?.reason ?? null;
  const deliverySelectable =
    availableServices.includes('delivery') && deliveryServiceAvailable;

  const { quote: deliveryQuote, loading: deliveryQuoteLoading, error: deliveryQuoteError } =
    usePublicDeliveryQuote({
      subdomain,
      enabled:
        fulfillment.serviceType === 'delivery' &&
        deliverySelectable &&
        fulfillment.deliveryLatitude != null &&
        fulfillment.deliveryLongitude != null,
      latitude: fulfillment.deliveryLatitude,
      longitude: fulfillment.deliveryLongitude,
    });

  useEffect(() => {
    if (fulfillment.serviceType !== 'delivery') return;
    if (!deliveryQuote) return;

    const nextFee = deliveryQuote.available ? deliveryQuote.delivery_fee_cents : null;
    if (fulfillment.deliveryFeeCents === nextFee) return;

    persistFulfillment({
      ...fulfillment,
      deliveryFeeCents: nextFee,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryQuote]);

  const paymentMethods = useMemo(
    () => (config ? enabledPaymentMethodsForService(config, fulfillment.serviceType) : []),
    [config, fulfillment.serviceType],
  );

  const canContinue = isFulfillmentComplete(fulfillment, config, {
    deliveryServiceAvailable: fulfillment.serviceType === 'delivery' ? deliverySelectable : true,
    deliveryQuoteAvailable:
      fulfillment.serviceType === 'delivery'
        ? deliveryQuote?.available === true && !deliveryQuoteLoading
        : true,
  });
  const deliveryBlockingReason =
    fulfillment.serviceType === 'delivery'
      ? deliveryQuoteError ??
        deliveryQuote?.reason ??
        (!deliverySelectable ? deliveryServiceReason : null)
      : null;

  const deliveryWeatherFeeNotice =
    deliveryQuote?.available === true
      ? getDeliveryWeatherNotice(deliveryQuote.weather_mode, 'fee')
      : null;

  const deliveryWeatherBlockedNotice =
    deliveryQuote?.available === false
      ? getDeliveryWeatherNotice(deliveryQuote.weather_mode, 'blocked')
      : null;

  const deliveryPaymentReady =
    deliveryQuote?.available === true &&
    fulfillment.deliveryFeeCents != null &&
    !deliveryQuoteLoading &&
    !deliveryBlockingReason;

  const showPaymentSection =
    fulfillment.serviceType === 'takeout'
      ? true
      : deliverySelectable && deliveryPaymentReady;

  const validationIssues = useMemo(
    (): CheckoutValidationIssue[] =>
      getCheckoutValidationIssues({
        fulfillment,
        deliverySelectable,
        deliveryQuoteLoading,
        deliveryBlockingReason,
        showPaymentSection,
      }),
    [
      fulfillment,
      deliverySelectable,
      deliveryQuoteLoading,
      deliveryBlockingReason,
      showPaymentSection,
    ],
  );

  const validationBannerMessage = useMemo(
    () => checkoutValidationBannerMessage(validationIssues),
    [validationIssues],
  );

  const showValidationBanner = validationAttempted && validationIssues.length > 0;

  const showCustomerNameError =
    (customerTouched || validationAttempted) &&
    checkoutFieldHasIssue(validationIssues, 'customerName');

  const showCustomerPhoneError =
    (customerPhoneTouched || validationAttempted) &&
    checkoutFieldHasIssue(validationIssues, 'customerPhone');

  const showAddressValidation =
    (addressTouched || validationAttempted) &&
    checkoutFieldHasIssue(validationIssues, 'deliveryAddress');

  const showPaymentValidation =
    validationAttempted && checkoutFieldHasIssue(validationIssues, 'paymentMethod');

  useEffect(() => {
    return () => {
      if (validationScrollTimerRef.current != null) {
        window.clearTimeout(validationScrollTimerRef.current);
      }
    };
  }, []);

  const revealValidationIssues = () => {
    if (validationIssues.length === 0) return;

    setValidationAttempted(true);
    setCustomerTouched(true);
    setCustomerPhoneTouched(true);
    if (fulfillment.serviceType === 'delivery') {
      setAddressTouched(true);
    }
    setContinueBtnAttention(true);
    window.setTimeout(() => setContinueBtnAttention(false), 520);

    const firstSectionId = validationIssues[0]?.sectionId;
    if (validationScrollTimerRef.current != null) {
      window.clearTimeout(validationScrollTimerRef.current);
    }
    validationScrollTimerRef.current = window.setTimeout(() => {
      const target = firstSectionId ? sectionRefs.current[firstSectionId] : null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      validationScrollTimerRef.current = null;
    }, 80);
  };

  const handleServiceChange = (serviceType: RestaurantServiceType) => {
    if (!config || !availableServices.includes(serviceType)) return;
    const nextPaymentMethods = enabledPaymentMethodsForService(config, serviceType);
    const keepsPayment =
      fulfillment.paymentMethod != null &&
      nextPaymentMethods.includes(fulfillment.paymentMethod);
    const nextPaymentMethod = keepsPayment ? fulfillment.paymentMethod : (nextPaymentMethods[0] ?? null);
    persistFulfillment({
      serviceType,
      ...(serviceType === 'delivery'
        ? {
            deliveryAddress: fulfillment.deliveryAddress,
            deliveryAddressDetails: fulfillment.deliveryAddressDetails,
            deliveryLatitude: fulfillment.deliveryLatitude,
            deliveryLongitude: fulfillment.deliveryLongitude,
            deliveryPlaceId: fulfillment.deliveryPlaceId,
            deliveryFeeCents: fulfillment.deliveryFeeCents,
          }
        : EMPTY_DELIVERY_LOCATION),
      paymentMethod: nextPaymentMethod,
      customerName: fulfillment.customerName,
      customerPhoneCountryIso: fulfillment.customerPhoneCountryIso,
      customerPhoneLocal: fulfillment.customerPhoneLocal,
      cashDenominationCents:
        serviceType === 'delivery' && nextPaymentMethod === 'cash'
          ? fulfillment.cashDenominationCents
          : null,
    });
    setAddressTouched(false);
    setValidationAttempted(false);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canContinue) {
      revealValidationIssues();
      return;
    }
    setValidationAttempted(false);
    onContinue();
  };

  if (loading) {
    return (
      <div
        className={`${styles.checkoutDetails} ${isTabletLayout ? menuStyles.publicTablet : ''}`}
      >
        <header className={styles.header}>
          <button type="button" className={styles.backBtn} aria-label="Volver al carrito" onClick={onBack}>
            <ArrowBackIcon fontSize="small" />
          </button>
          <div className={styles.headerCopy}>
            <h1 className={styles.title}>Completar pedido</h1>
          </div>
        </header>
        <p className={styles.loadingText}>Cargando opciones…</p>
      </div>
    );
  }

  return (
    <div className={`${styles.checkoutDetails} ${isTabletLayout ? menuStyles.publicTablet : ''}`}>
      <header className={styles.header}>
        <button type="button" className={styles.backBtn} aria-label="Volver al carrito" onClick={onBack}>
          <ArrowBackIcon fontSize="small" />
        </button>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>Completar pedido</h1>
          <p className={styles.headerMeta}>Elige cómo recibir y pagar tu pedido</p>
        </div>
      </header>

      <form className={styles.body} onSubmit={handleSubmit} noValidate>
        {loadError ? (
          <p className={styles.loadError} role="alert">
            {loadError}
          </p>
        ) : null}

        <section
          ref={(node) => {
            sectionRefs.current['checkout-contact-heading'] = node;
          }}
          className={`${styles.section} ${
            showCustomerNameError || showCustomerPhoneError ? styles.sectionNeedsAttention : ''
          }`}
          aria-labelledby="checkout-contact-heading"
        >
          <h2 id="checkout-contact-heading" className={styles.sectionTitle}>
            Tus datos de contacto
          </h2>
          <p className={styles.sectionHint}>
            El restaurante necesita tu nombre y WhatsApp para confirmar y dar seguimiento a tu pedido.
          </p>

          <div className={styles.contactFields}>
            <label className={styles.addressField} htmlFor="checkout-customer-name">
              <span className={styles.fieldLabel}>Nombre</span>
              <input
                id="checkout-customer-name"
                type="text"
                className={`${styles.textInput} ${
                  showCustomerNameError ? styles.fieldInputNeedsAttention : ''
                }`}
                autoComplete="name"
                value={fulfillment.customerName}
                onChange={(event) =>
                  persistFulfillment({
                    ...fulfillment,
                    customerName: event.target.value,
                  })
                }
                onBlur={() => setCustomerTouched(true)}
                placeholder="Tu nombre"
                aria-invalid={showCustomerNameError}
              />
              {showCustomerNameError ? (
                <p className={styles.fieldError} role="alert">
                  Ingresa tu nombre para continuar
                </p>
              ) : null}
            </label>

            <div className={styles.addressField}>
              <span id="checkout-customer-whatsapp-label" className={styles.fieldLabel}>
                WhatsApp
              </span>
              <PhoneInputWithCountry
                variant="digitalMenu"
                hasError={showCustomerPhoneError}
                countryIso={fulfillment.customerPhoneCountryIso}
                localNumber={fulfillment.customerPhoneLocal}
                placeholder="55 1234 5678"
                hint="Incluye solo el número local, sin lada."
                onCountryChange={(iso) =>
                  persistFulfillment({
                    ...fulfillment,
                    customerPhoneCountryIso: iso,
                  })
                }
                onLocalNumberChange={(value) =>
                  persistFulfillment({
                    ...fulfillment,
                    customerPhoneLocal: value,
                  })
                }
                onLocalNumberBlur={() => setCustomerPhoneTouched(true)}
              />
              {showCustomerPhoneError ? (
                <p className={styles.fieldError} role="alert">
                  Ingresa tu número de WhatsApp para continuar
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="checkout-service-heading">
          <h2 id="checkout-service-heading" className={styles.sectionTitle}>
            Selecciona el tipo de entrega
          </h2>
          {availableServices.length === 1 ? (
            <p className={styles.sectionHint}>
              Este restaurante solo ofrece {RESTAURANT_SERVICE_LABELS[availableServices[0]!].toLowerCase()}.
            </p>
          ) : null}

          <div
            className={`${styles.serviceSegment} ${
              availableServices.length === 1 ? styles.serviceSegmentSingle : ''
            }`}
            role="radiogroup"
            aria-labelledby="checkout-service-heading"
          >
            {availableServices.map((serviceType) => {
              const Icon = SERVICE_ICONS[serviceType];
              const selected = fulfillment.serviceType === serviceType;
              const readOnly = availableServices.length === 1;

              return (
                <button
                  key={serviceType}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`${styles.serviceOption} ${
                    selected ? styles.serviceOptionSelected : ''
                  } ${readOnly ? styles.serviceOptionReadOnly : ''}`}
                  onClick={() => handleServiceChange(serviceType)}
                  disabled={readOnly && !selected}
                >
                  <Icon className={styles.serviceOptionIcon} aria-hidden />
                  <span className={styles.serviceOptionLabel}>
                    {RESTAURANT_SERVICE_LABELS[serviceType]}
                  </span>
                </button>
              );
            })}
          </div>
          {fulfillment.serviceType === 'delivery' && !deliverySelectable && deliveryServiceReason ? (
            <p className={styles.deliveryAlert} role="alert">
              {deliveryServiceReason}
            </p>
          ) : null}
        </section>

        {fulfillment.serviceType === 'delivery' && deliverySelectable ? (
          <section
            ref={(node) => {
              sectionRefs.current['checkout-address-heading'] = node;
            }}
            className={`${styles.section} ${
              showAddressValidation ? styles.sectionNeedsAttention : ''
            }`}
            aria-labelledby="checkout-address-heading"
          >
            <h2 id="checkout-address-heading" className={styles.sectionTitle}>
              ¿A dónde lo llevamos?
            </h2>
            <CheckoutDeliveryAddressPicker
              value={{
                address: fulfillment.deliveryAddress,
                latitude: fulfillment.deliveryLatitude,
                longitude: fulfillment.deliveryLongitude,
                placeId: fulfillment.deliveryPlaceId,
              }}
              showValidation={showAddressValidation}
              onChange={(location) =>
                persistFulfillment({
                  ...fulfillment,
                  deliveryAddress: location.address,
                  deliveryLatitude: location.latitude,
                  deliveryLongitude: location.longitude,
                  deliveryPlaceId: location.placeId,
                  deliveryFeeCents: null,
                })
              }
            />

            <label className={styles.addressField} htmlFor="checkout-delivery-details">
              <span className={styles.fieldLabel}>
                Detalles para encontrarte
                <span className={styles.fieldOptional}> (opcional)</span>
              </span>
              <textarea
                id="checkout-delivery-details"
                className={styles.textArea}
                rows={3}
                maxLength={240}
                value={fulfillment.deliveryAddressDetails}
                onChange={(event) =>
                  persistFulfillment({
                    ...fulfillment,
                    deliveryAddressDetails: event.target.value,
                  })
                }
                placeholder="Ej. casa blanca, puerta de madera, entre calles…"
              />
              <p className={styles.fieldHint}>
                Ayuda al repartidor a llegar más rápido a tu ubicación.
              </p>
            </label>

            {deliveryQuoteLoading ? (
              <p className={styles.deliveryStatus} role="status">
                Validando cobertura y calculando envío…
              </p>
            ) : null}

            {deliveryBlockingReason ? (
              <p className={styles.deliveryAlert} role="alert">
                {deliveryWeatherBlockedNotice ?? deliveryBlockingReason}
              </p>
            ) : null}

            {deliveryQuote?.available && fulfillment.deliveryFeeCents != null ? (
              <div className={styles.deliveryFeeCard} role="status">
                <span className={styles.deliveryFeeLabel}>Costo de envío</span>
                <span className={styles.deliveryFeeValue}>
                  {formatMoney(fulfillment.deliveryFeeCents / 100, currency)}
                </span>
                <span className={styles.deliveryFeeHint}>
                  {deliveryQuote.inside_polygon
                    ? 'Dentro de la zona de cobertura.'
                    : deliveryQuote.distance_km != null
                      ? `${deliveryQuote.distance_km.toFixed(1)} km de ruta · solo horario diurno`
                      : 'Fuera del polígono de cobertura · solo horario diurno'}
                </span>
                {deliveryWeatherFeeNotice ? (
                  <p className={styles.deliveryWeatherNotice}>
                    <WaterDropOutlinedIcon
                      className={styles.deliveryWeatherIcon}
                      aria-hidden
                    />
                    <span>{deliveryWeatherFeeNotice}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {showPaymentSection ? (
        <section
          ref={(node) => {
            sectionRefs.current['checkout-payment-heading'] = node;
          }}
          className={`${styles.section} ${
            showPaymentValidation ? styles.sectionNeedsAttention : ''
          }`}
          aria-labelledby="checkout-payment-heading"
        >
          <h2 id="checkout-payment-heading" className={styles.sectionTitle}>
            ¿Cómo te gustaría pagar?
          </h2>
          {paymentMethods.length === 0 ? (
            <p className={styles.emptyPayment}>
              {fulfillment.serviceType === 'delivery'
                ? 'Este restaurante no tiene métodos de pago disponibles para entrega a domicilio. Contacta al restaurante.'
                : 'No hay métodos de pago disponibles para recoger en el local. Contacta al restaurante.'}
            </p>
          ) : (
            <ul
              className={`${styles.paymentList} ${
                showPaymentValidation ? styles.paymentListNeedsAttention : ''
              }`}
              role="radiogroup"
              aria-labelledby="checkout-payment-heading"
            >
              {paymentMethods.map((method) => {
                const Icon = PAYMENT_ICONS[method];
                const selected = fulfillment.paymentMethod === method;
                return (
                  <li key={method}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`${styles.paymentOption} ${
                        selected ? styles.paymentOptionSelected : ''
                      }`}
                      onClick={() =>
                        persistFulfillment({
                          ...fulfillment,
                          paymentMethod: method,
                          cashDenominationCents:
                            method === 'cash' ? fulfillment.cashDenominationCents : null,
                        })
                      }
                    >
                      <Icon className={styles.paymentIcon} aria-hidden />
                      <span className={styles.paymentCopy}>
                        <span className={styles.paymentLabel}>{PAYMENT_METHOD_LABELS[method]}</span>
                        <span className={styles.paymentHint}>{PAYMENT_HINTS[method]}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {showPaymentValidation ? (
            <p className={styles.fieldError} role="alert">
              Elige cómo te gustaría pagar
            </p>
          ) : null}
        </section>
        ) : null}
      </form>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          {showValidationBanner && validationBannerMessage ? (
            <div
              id="checkout-continue-validation"
              className={styles.continueValidationBanner}
              role="alert"
              aria-live="assertive"
            >
              <InfoOutlinedIcon
                className={styles.continueValidationIcon}
                sx={{ fontSize: 20 }}
                aria-hidden
              />
              <p className={styles.continueValidationText}>{validationBannerMessage}</p>
            </div>
          ) : null}
          <button
            type="submit"
            className={`${styles.continueBtn} ${
              canContinue ? styles.continueBtnReady : styles.continueBtnActionable
            } ${continueBtnAttention ? styles.continueBtnAttention : ''}`}
            aria-disabled={!canContinue}
            aria-describedby={
              showValidationBanner ? 'checkout-continue-validation' : undefined
            }
            onClick={handleSubmit}
          >
            <span>Revisar pedido</span>
            <ArrowForwardIcon sx={{ fontSize: 18 }} aria-hidden />
          </button>
        </div>
      </footer>
    </div>
  );
}
