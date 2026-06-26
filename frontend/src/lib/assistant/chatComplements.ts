/** Synthetic option id when `allowCustomInput` is enabled on a choice field. */
export const CHAT_FORM_CUSTOM_OPTION_ID = '__custom__';

export type ChatFormChoiceOption = {
  id: string;
  label: string;
};

export type ChatFormFieldBase = {
  id: string;
  label: string;
  required?: boolean;
  helpText?: string;
};

export type ChatFormChoiceField = ChatFormFieldBase & {
  type: 'choice';
  options: ChatFormChoiceOption[];
  /** When true, user can pick "Other" and type a custom value. */
  allowCustomInput?: boolean;
  customInputLabel?: string;
  customInputPlaceholder?: string;
};

export type ChatFormTextField = ChatFormFieldBase & {
  type: 'text';
  placeholder?: string;
  multiline?: boolean;
};

export type ChatFormField = ChatFormChoiceField | ChatFormTextField;

export type ChatFormComplement = {
  type: 'form';
  id: string;
  title?: string;
  description?: string;
  fields: ChatFormField[];
  submitLabel?: string;
};

export type ChatComplement = ChatFormComplement;

export type ChatFormFieldValue =
  | { kind: 'choice'; optionId: string; customValue?: string }
  | { kind: 'text'; value: string };

export type ChatFormSubmission = {
  complementId: string;
  messageId: string;
  values: Record<string, ChatFormFieldValue>;
};

export function isChatFormComplement(
  complement: ChatComplement | undefined,
): complement is ChatFormComplement {
  return complement?.type === 'form';
}

export function formatFormSubmissionAsText(
  complement: ChatFormComplement,
  values: Record<string, ChatFormFieldValue>,
): string {
  const lines = complement.fields
    .map((field) => {
      const value = values[field.id];
      if (!value) return null;

      if (field.type === 'text' && value.kind === 'text' && value.value.trim()) {
        return `${field.label}: ${value.value.trim()}`;
      }

      if (field.type === 'choice' && value.kind === 'choice') {
        if (value.optionId === CHAT_FORM_CUSTOM_OPTION_ID) {
          return `${field.label}: ${value.customValue?.trim() || '—'}`;
        }
        const option = field.options.find((item) => item.id === value.optionId);
        return `${field.label}: ${option?.label ?? value.optionId}`;
      }

      return null;
    })
    .filter((line): line is string => line != null);

  return lines.join('\n');
}

export const MOCK_PRODUCT_FORM: ChatFormComplement = {
  type: 'form',
  id: 'product-create-step-1',
  title: 'Nuevo producto',
  description: 'Completa estos datos para continuar.',
  submitLabel: 'Continuar',
  fields: [
    {
      type: 'choice',
      id: 'category',
      label: '¿En qué categoría va?',
      required: true,
      options: [
        { id: 'entradas', label: 'Entradas' },
        { id: 'platos', label: 'Platos fuertes' },
        { id: 'bebidas', label: 'Bebidas' },
      ],
      allowCustomInput: true,
      customInputLabel: 'Otra categoría',
      customInputPlaceholder: 'Escribe la categoría...',
    },
    {
      type: 'text',
      id: 'product_name',
      label: 'Nombre del producto',
      placeholder: 'Ej. Tacos al pastor',
      required: true,
    },
  ],
};

export const MOCK_PROMOTION_FORM: ChatFormComplement = {
  type: 'form',
  id: 'promotion-create-step-1',
  title: 'Nueva promoción',
  description: 'Elige el tipo de descuento.',
  submitLabel: 'Siguiente',
  fields: [
    {
      type: 'choice',
      id: 'discount_type',
      label: 'Tipo de promoción',
      required: true,
      options: [
        { id: 'percent', label: 'Porcentaje (%)' },
        { id: 'fixed', label: 'Monto fijo ($)' },
        { id: 'combo', label: 'Combo / 2x1' },
      ],
      allowCustomInput: true,
      customInputLabel: 'Otro tipo',
      customInputPlaceholder: 'Describe la promoción...',
    },
    {
      type: 'text',
      id: 'discount_value',
      label: 'Valor del descuento',
      placeholder: 'Ej. 15 o 50',
      required: true,
    },
  ],
};
