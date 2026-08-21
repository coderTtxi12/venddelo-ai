'use client';

import WaterDropOutlinedIcon from '@mui/icons-material/WaterDropOutlined';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeliveryLocationValue } from '@/components/digital-menu/CheckoutDeliveryAddressPicker';
import { DispatchDeliveryAddressPicker } from '@/components/dispatch/DispatchDeliveryAddressPicker';
import { PhoneInputWithCountry } from '@/components/onboarding/PhoneInputWithCountry';
import { FormSelect } from '@/components/ui/FormSelect';
import {
  createDispatchRequest,
  resolveDispatchMapsUrl,
  type DispatchCreateInput,
  type DispatchRequest,
} from '@/lib/api/dispatch';
import { ApiError } from '@/lib/api/types';
import { formatMoney } from '@/lib/currency';
import { getDeliveryWeatherNotice } from '@/lib/digital-menu/checkout/deliveryWeatherNotice';
import { usePublicDeliveryQuote } from '@/lib/digital-menu/checkout/usePublicDeliveryQuote';
import type { KitchenDispatchFormValues } from '@/lib/orders/kitchenDispatch';
import { DEFAULT_COUNTRY_ISO, findCountryByIso, formatE164 } from '@/lib/phone/countryDialCodes';
import styles from './RequestDeliveryForm.module.css';

const PREP_CUSTOM_VALUE = 'custom';

const EMPTY_LOCATION: DeliveryLocationValue = {
  address: '',
  latitude: null,
  longitude: null,
  placeId: null,
};

function parsePesosToCents(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  return Math.round(Number(trimmed) * 100);
}

function valuesToLocation(values?: KitchenDispatchFormValues | null): DeliveryLocationValue {
  if (!values) return EMPTY_LOCATION;
  return {
    address: values.address,
    latitude: values.latitude,
    longitude: values.longitude,
    placeId: null,
  };
}

export function RequestDeliveryForm({
  accessToken,
  restaurantId,
  subdomain,
  courierAvailable,
  courierReason,
  leadTimes,
  initialValues = null,
  submitLabel = 'Solicitar repartidor',
  resetOnSuccess = true,
  onCreated,
}: {
  accessToken: string;
  restaurantId: string;
  subdomain: string;
  courierAvailable: boolean;
  courierReason: string | null;
  leadTimes: number[];
  initialValues?: KitchenDispatchFormValues | null;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  onCreated: (request: DispatchRequest) => void | Promise<void>;
}) {
  const [location, setLocation] = useState<DeliveryLocationValue>(() =>
    valuesToLocation(initialValues),
  );
  const [mapsUrl, setMapsUrl] = useState<string | null>(null);
  const [addressReferences, setAddressReferences] = useState(
    initialValues?.addressReferences ?? '',
  );
  const [paymentMethod, setPaymentMethod] = useState<DispatchCreateInput['payment_method']>(
    initialValues?.paymentMethod ?? 'cash',
  );
  const [packageSize, setPackageSize] = useState<'normal' | 'grande'>('normal');
  const [packageCount, setPackageCount] = useState('1');
  const [prepSelection, setPrepSelection] = useState(() =>
    leadTimes[0] != null ? String(leadTimes[0]) : PREP_CUSTOM_VALUE,
  );
  const [customPrepMinutes, setCustomPrepMinutes] = useState('');
  const [collectAmount, setCollectAmount] = useState(initialValues?.collectAmount ?? '0');
  const [cashDenomination, setCashDenomination] = useState(
    initialValues?.cashDenomination ?? '',
  );
  const [customerName, setCustomerName] = useState(initialValues?.customerName ?? '');
  const [phoneCountryIso, setPhoneCountryIso] = useState(
    initialValues?.phoneCountryIso ?? DEFAULT_COUNTRY_ISO,
  );
  const [phoneLocal, setPhoneLocal] = useState(initialValues?.phoneLocal ?? '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepMinutes = useMemo(() => {
    if (prepSelection === PREP_CUSTOM_VALUE) {
      const parsed = Number(customPrepMinutes);
      if (!Number.isFinite(parsed)) return null;
      return parsed;
    }
    const parsed = Number(prepSelection);
    return Number.isFinite(parsed) ? parsed : null;
  }, [customPrepMinutes, prepSelection]);

  const prepValid =
    prepMinutes != null && prepMinutes >= 1 && prepMinutes < 60 && Number.isInteger(prepMinutes);

  const quoteEnabled =
    courierAvailable &&
    subdomain.length > 0 &&
    location.latitude != null &&
    location.longitude != null;

  const { quote: deliveryQuote, loading: deliveryQuoteLoading, error: deliveryQuoteError } =
    usePublicDeliveryQuote({
      subdomain,
      enabled: quoteEnabled,
      latitude: location.latitude,
      longitude: location.longitude,
    });

  const deliveryBlockingReason = deliveryQuoteError ?? deliveryQuote?.reason ?? null;
  const deliveryWeatherFeeNotice =
    deliveryQuote?.available === true
      ? getDeliveryWeatherNotice(deliveryQuote.weather_mode, 'fee')
      : null;
  const deliveryWeatherBlockedNotice =
    deliveryQuote?.available === false
      ? getDeliveryWeatherNotice(deliveryQuote.weather_mode, 'blocked')
      : null;

  const resolveMapsUrlForPicker = useCallback(
    async (url: string) => {
      const resolved = await resolveDispatchMapsUrl(accessToken, restaurantId, url);
      return { latitude: resolved.latitude, longitude: resolved.longitude };
    },
    [accessToken, restaurantId],
  );

  useEffect(() => {
    setPrepSelection((current) => {
      if (current && (current === PREP_CUSTOM_VALUE || leadTimes.includes(Number(current)))) {
        return current;
      }
      return leadTimes[0] != null ? String(leadTimes[0]) : PREP_CUSTOM_VALUE;
    });
  }, [leadTimes]);

  useEffect(() => {
    if (!initialValues) return;
    setCustomerName(initialValues.customerName);
    setPhoneCountryIso(initialValues.phoneCountryIso);
    setPhoneLocal(initialValues.phoneLocal);
    setLocation(valuesToLocation(initialValues));
    setMapsUrl(null);
    setAddressReferences(initialValues.addressReferences);
    setPaymentMethod(initialValues.paymentMethod);
    setCollectAmount(initialValues.collectAmount);
    setCashDenomination(initialValues.cashDenomination);
    setPackageSize('normal');
    setPackageCount('1');
    setNotes('');
  }, [initialValues]);

  const paymentOptions = useMemo(
    () => [
      { value: 'cash', label: 'Efectivo' },
      { value: 'transfer', label: 'Transferencia' },
      { value: 'card_terminal', label: 'Terminal' },
    ],
    [],
  );

  const packageSizeOptions = useMemo(
    () => [
      { value: 'normal', label: 'Normal' },
      {
        value: 'grande',
        label: 'Grande',
        description: 'Solo paquetes del tamaño de una caja de pizza',
      },
    ],
    [],
  );

  const prepOptions = useMemo(
    () => [
      ...leadTimes.map((minutes) => ({
        value: String(minutes),
        label: `${minutes} minutos`,
      })),
      { value: PREP_CUSTOM_VALUE, label: 'Personalizado' },
    ],
    [leadTimes],
  );

  const deliveryQuoteReady =
    deliveryQuote != null &&
    deliveryQuote.available === true &&
    Number.isFinite(deliveryQuote.delivery_fee_cents) &&
    deliveryQuote.delivery_fee_cents >= 0 &&
    !deliveryQuoteLoading &&
    !deliveryQuoteError;

  const canRequestRider =
    courierAvailable &&
    location.latitude != null &&
    location.longitude != null &&
    location.address.trim().length > 0 &&
    deliveryQuoteReady &&
    prepValid &&
    Number(packageCount) >= 1 &&
    !submitting;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRequestRider || prepMinutes == null) return;

    if (
      !deliveryQuote?.available ||
      !Number.isFinite(deliveryQuote.delivery_fee_cents)
    ) {
      setError('Espera a que se calcule el costo de envío para esta ubicación.');
      return;
    }

    const name = customerName.trim();
    const customerPhone = formatE164(
      findCountryByIso(phoneCountryIso).dialCode,
      phoneLocal,
    );
    if (!name || phoneLocal.replace(/\D/g, '').length < 8) {
      setError('Completa el nombre y celular del cliente.');
      return;
    }

    const references = addressReferences.trim();
    const dropoffAddress = references
      ? `${location.address.trim()} · ${references}`
      : location.address.trim();

    let collectCents = 0;
    let cashDenominationCents: number | null = null;

    if (paymentMethod === 'cash') {
      collectCents = parsePesosToCents(collectAmount);
      cashDenominationCents = parsePesosToCents(cashDenomination);
      if (!cashDenomination.trim()) {
        setError('Indica con qué billete o moneda pagará el cliente.');
        return;
      }
      if (cashDenominationCents < collectCents) {
        setError('La denominación debe cubrir el monto a cobrar.');
        return;
      }
    } else if (paymentMethod === 'card_terminal') {
      collectCents = parsePesosToCents(collectAmount);
    }

    setSubmitting(true);
    setError(null);
    try {
      const row = await createDispatchRequest(accessToken, restaurantId, {
        customer_name: name,
        customer_phone: customerPhone,
        dropoff_lat: location.latitude,
        dropoff_lng: location.longitude,
        dropoff_address: dropoffAddress,
        dropoff_maps_url: mapsUrl,
        payment_method: paymentMethod,
        collect_cents: collectCents,
        cash_denomination_cents: cashDenominationCents,
        package_size: packageSize,
        package_count: Number(packageCount),
        prep_minutes: prepMinutes,
        notes: notes.trim() || null,
      });
      await onCreated(row);
      if (resetOnSuccess) {
        setLocation(EMPTY_LOCATION);
        setMapsUrl(null);
        setAddressReferences('');
        setPaymentMethod('cash');
        setPackageSize('normal');
        setPackageCount('1');
        setCollectAmount('0');
        setCashDenomination('');
        setCustomPrepMinutes('');
        setCustomerName('');
        setPhoneCountryIso(DEFAULT_COUNTRY_ISO);
        setPhoneLocal('');
        setNotes('');
        if (leadTimes[0] != null) setPrepSelection(String(leadTimes[0]));
      }
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? submitError.message
          : 'No se pudo solicitar el delivery.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      {!courierAvailable ? (
        <div className={styles.serviceAlert} role="alert">
          {courierReason ?? 'El servicio de reparto de Mexy no está disponible en este momento.'}
        </div>
      ) : null}

      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      <div className={styles.gridTwo}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="customer-name">
            Nombre del cliente
          </label>
          <input
            id="customer-name"
            name="customer_name"
            className={styles.input}
            required
            maxLength={200}
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            disabled={!courierAvailable}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="customer-phone">
            Celular
          </label>
          <PhoneInputWithCountry
            inputId="customer-phone"
            countryIso={phoneCountryIso}
            localNumber={phoneLocal}
            onCountryChange={setPhoneCountryIso}
            onLocalNumberChange={setPhoneLocal}
            placeholder="55 1234 5678"
            disabled={!courierAvailable}
            flat
          />
        </div>
      </div>

      <DispatchDeliveryAddressPicker
        value={location}
        mapsUrl={mapsUrl}
        onChange={setLocation}
        onMapsUrlChange={setMapsUrl}
        resolveMapsUrl={resolveMapsUrlForPicker}
        disabled={!courierAvailable}
      />

      <div className={styles.field}>
        <label className={styles.label} htmlFor="address-references">
          Referencias de dirección
          <span className={styles.optional}> (opcional)</span>
        </label>
        <input
          id="address-references"
          className={styles.input}
          value={addressReferences}
          onChange={(event) => setAddressReferences(event.target.value)}
          placeholder="Ej. puerta color blanca, junto a la farmacia"
          maxLength={200}
          disabled={!courierAvailable}
        />
      </div>

      {deliveryQuoteLoading ? (
        <p className={styles.quoteStatus} role="status">
          Validando cobertura y calculando envío…
        </p>
      ) : null}

      {deliveryBlockingReason && location.latitude != null ? (
        <p className={styles.quoteAlert} role="alert">
          {deliveryWeatherBlockedNotice ?? deliveryBlockingReason}
        </p>
      ) : null}

      {deliveryQuote?.available && location.latitude != null ? (
        <div className={styles.feeCard} role="status">
          <span className={styles.feeLabel}>Costo de envío</span>
          <span className={styles.feeValue}>
            {formatMoney(deliveryQuote.delivery_fee_cents / 100, 'MXN')}
          </span>
          <span className={styles.feeHint}>
            {deliveryQuote.inside_polygon
              ? 'Dentro de la zona de cobertura.'
              : deliveryQuote.distance_km != null
                ? `${deliveryQuote.distance_km.toFixed(1)} km de ruta · solo horario diurno`
                : 'Fuera del polígono de cobertura · solo horario diurno'}
          </span>
          {deliveryWeatherFeeNotice ? (
            <p className={styles.weatherNotice}>
              <WaterDropOutlinedIcon className={styles.weatherIcon} aria-hidden />
              <span>{deliveryWeatherFeeNotice}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.gridThree}>
        <div className={styles.field}>
          <span className={styles.label} id="payment-method-label">
            Forma de pago
          </span>
          <FormSelect
            id="payment-method"
            value={paymentMethod}
            options={paymentOptions}
            onChange={(value) =>
              setPaymentMethod(value as DispatchCreateInput['payment_method'])
            }
            disabled={!courierAvailable}
            aria-labelledby="payment-method-label"
          />
        </div>

        {paymentMethod !== 'transfer' ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="collect-amount">
              Monto del restaurante
            </label>
            <input
              id="collect-amount"
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
              required
              value={collectAmount}
              onChange={(event) => setCollectAmount(event.target.value)}
              disabled={!courierAvailable}
            />
            <p className={styles.fieldHint}>Sin incluir el costo de envío.</p>
          </div>
        ) : null}

        {paymentMethod === 'cash' ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cash-denomination">
              ¿Con cuánto paga?
            </label>
            <input
              id="cash-denomination"
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
              required
              value={cashDenomination}
              onChange={(event) => setCashDenomination(event.target.value)}
              disabled={!courierAvailable}
            />
          </div>
        ) : null}
      </div>

      <div className={styles.gridThree}>
        <div className={styles.field}>
          <span className={styles.label} id="package-size-label">
            Tamaño del paquete mayor
          </span>
          <FormSelect
            id="package-size"
            value={packageSize}
            options={packageSizeOptions}
            onChange={(value) => setPackageSize(value as 'normal' | 'grande')}
            disabled={!courierAvailable}
            aria-labelledby="package-size-label"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="package-count">
            Número de paquetes
          </label>
          <input
            id="package-count"
            className={styles.input}
            type="number"
            min="1"
            required
            value={packageCount}
            onChange={(event) => setPackageCount(event.target.value)}
            disabled={!courierAvailable}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.label} id="prep-minutes-label">
            Listo en
          </span>
          <FormSelect
            id="prep-minutes"
            value={prepSelection}
            options={prepOptions}
            onChange={setPrepSelection}
            disabled={!courierAvailable || prepOptions.length === 0}
            aria-labelledby="prep-minutes-label"
          />
        </div>
      </div>

      {prepSelection === PREP_CUSTOM_VALUE ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="custom-prep-minutes">
            Minutos personalizados
          </label>
          <input
            id="custom-prep-minutes"
            className={styles.input}
            type="number"
            min="1"
            max="59"
            step="1"
            required
            value={customPrepMinutes}
            onChange={(event) => setCustomPrepMinutes(event.target.value)}
            placeholder="Menor a 60"
            disabled={!courierAvailable}
          />
          {!prepValid && customPrepMinutes.trim() ? (
            <p className={styles.fieldHint} role="alert">
              Usa un número entero entre 1 y 59 minutos.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className={styles.weightNotice}>Máximo 20 kg en la suma de todos los paquetes.</p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="driver-notes">
          Notas para el repartidor
        </label>
        <textarea
          id="driver-notes"
          className={styles.textarea}
          maxLength={500}
          rows={3}
          disabled={!courierAvailable}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <button
        className={styles.primaryButton}
        type="submit"
        disabled={!canRequestRider}
      >
        {submitting ? 'Solicitando…' : submitLabel}
      </button>
    </form>
  );
}
