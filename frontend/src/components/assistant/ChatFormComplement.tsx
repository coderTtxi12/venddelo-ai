'use client';

import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import { useMemo, useState } from 'react';
import {
  CHAT_FORM_CUSTOM_OPTION_ID,
  type ChatFormComplement,
  type ChatFormFieldValue,
  type ChatFormSubmission,
} from '@/lib/assistant/chatComplements';
import styles from './ChatFormComplement.module.css';

type ChatFormComplementProps = {
  complement: ChatFormComplement;
  messageId: string;
  submitted?: boolean;
  onSubmit: (submission: ChatFormSubmission) => void;
};

type FormState = Record<string, ChatFormFieldValue>;

function buildInitialState(complement: ChatFormComplement): FormState {
  const state: FormState = {};
  for (const field of complement.fields) {
    if (field.type === 'text') {
      state[field.id] = { kind: 'text', value: '' };
    }
  }
  return state;
}

function validateForm(
  complement: ChatFormComplement,
  values: FormState,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of complement.fields) {
    const value = values[field.id];
    if (!field.required) continue;

    if (field.type === 'text') {
      if (!value || value.kind !== 'text' || !value.value.trim()) {
        errors[field.id] = 'Este campo es obligatorio.';
      }
      continue;
    }

    if (field.type === 'choice') {
      if (!value || value.kind !== 'choice' || !value.optionId) {
        errors[field.id] = 'Selecciona una opción.';
        continue;
      }
      if (
        value.optionId === CHAT_FORM_CUSTOM_OPTION_ID &&
        !value.customValue?.trim()
      ) {
        errors[field.id] = 'Escribe un valor personalizado.';
      }
    }
  }

  return errors;
}

export default function ChatFormComplement({
  complement,
  messageId,
  submitted = false,
  onSubmit,
}: ChatFormComplementProps) {
  const [values, setValues] = useState<FormState>(() => buildInitialState(complement));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isDisabled = submitted;

  const handleChoiceSelect = (fieldId: string, optionId: string) => {
    if (isDisabled) return;
    setValues((prev) => ({
      ...prev,
      [fieldId]: {
        kind: 'choice',
        optionId,
        customValue:
          optionId === CHAT_FORM_CUSTOM_OPTION_ID
            ? prev[fieldId]?.kind === 'choice'
              ? prev[fieldId].customValue
              : ''
            : undefined,
      },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const handleCustomValueChange = (fieldId: string, customValue: string) => {
    if (isDisabled) return;
    setValues((prev) => ({
      ...prev,
      [fieldId]: {
        kind: 'choice',
        optionId: CHAT_FORM_CUSTOM_OPTION_ID,
        customValue,
      },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const handleTextChange = (fieldId: string, value: string) => {
    if (isDisabled) return;
    setValues((prev) => ({
      ...prev,
      [fieldId]: { kind: 'text', value },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const handleSubmit = () => {
    if (isDisabled) return;
    const nextErrors = validateForm(complement, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({
      complementId: complement.id,
      messageId,
      values,
    });
  };

  const fields = useMemo(() => complement.fields, [complement.fields]);

  return (
    <div
      className={`${styles.card} ${submitted ? styles.submitted : ''}`}
      role="form"
      aria-label={complement.title ?? 'Formulario del asistente'}
    >
      {complement.title || complement.description ? (
        <div className={styles.header}>
          {complement.title ? <h3 className={styles.title}>{complement.title}</h3> : null}
          {complement.description ? (
            <p className={styles.description}>{complement.description}</p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.fields}>
        {fields.map((field) => {
          const fieldError = errors[field.id];

          if (field.type === 'choice') {
            const fieldValue = values[field.id];
            const selected = fieldValue?.kind === 'choice' ? fieldValue.optionId : undefined;
            const customValue =
              fieldValue?.kind === 'choice' ? fieldValue.customValue ?? '' : '';

            return (
              <div key={field.id} className={styles.field}>
                <label className={styles.fieldLabel} id={`field-label-${field.id}`}>
                  {field.label}
                  {field.required ? ' *' : ''}
                </label>
                {field.helpText ? <p className={styles.fieldHelp}>{field.helpText}</p> : null}

                <div
                  className={styles.choiceList}
                  role="radiogroup"
                  aria-labelledby={`field-label-${field.id}`}
                >
                  {field.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`${styles.choiceOption} ${
                        selected === option.id ? styles.choiceOptionSelected : ''
                      }`}
                      disabled={isDisabled}
                      aria-pressed={selected === option.id}
                      onClick={() => handleChoiceSelect(field.id, option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                  {field.allowCustomInput ? (
                    <button
                      type="button"
                      className={`${styles.choiceOption} ${
                        selected === CHAT_FORM_CUSTOM_OPTION_ID
                          ? styles.choiceOptionSelected
                          : ''
                      }`}
                      disabled={isDisabled}
                      aria-pressed={selected === CHAT_FORM_CUSTOM_OPTION_ID}
                      onClick={() => handleChoiceSelect(field.id, CHAT_FORM_CUSTOM_OPTION_ID)}
                    >
                      {field.customInputLabel ?? 'Otra'}
                    </button>
                  ) : null}
                </div>

                {field.allowCustomInput && selected === CHAT_FORM_CUSTOM_OPTION_ID ? (
                  <div className={styles.customInputWrap}>
                    <label htmlFor={`custom-${field.id}`} className={styles.customInputLabel}>
                      {field.customInputPlaceholder ?? 'Valor personalizado'}
                    </label>
                    <input
                      id={`custom-${field.id}`}
                      type="text"
                      className={styles.textInput}
                      value={customValue}
                      disabled={isDisabled}
                      placeholder={field.customInputPlaceholder}
                      onChange={(event) =>
                        handleCustomValueChange(field.id, event.target.value)
                      }
                    />
                  </div>
                ) : null}

                {fieldError ? <p className={styles.error}>{fieldError}</p> : null}
              </div>
            );
          }

          const fieldValue = values[field.id];
          const textValue = fieldValue?.kind === 'text' ? fieldValue.value : '';

          return (
            <div key={field.id} className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={`field-${field.id}`}>
                {field.label}
                {field.required ? ' *' : ''}
              </label>
              {field.helpText ? <p className={styles.fieldHelp}>{field.helpText}</p> : null}

              {field.multiline ? (
                <textarea
                  id={`field-${field.id}`}
                  className={styles.textArea}
                  value={textValue}
                  disabled={isDisabled}
                  placeholder={field.placeholder}
                  onChange={(event) => handleTextChange(field.id, event.target.value)}
                />
              ) : (
                <input
                  id={`field-${field.id}`}
                  type="text"
                  className={styles.textInput}
                  value={textValue}
                  disabled={isDisabled}
                  placeholder={field.placeholder}
                  onChange={(event) => handleTextChange(field.id, event.target.value)}
                />
              )}

              {fieldError ? <p className={styles.error}>{fieldError}</p> : null}
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        {submitted ? (
          <span className={styles.submittedBadge}>
            <CheckCircleOutlineOutlinedIcon sx={{ fontSize: 16 }} />
            Enviado
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          className={styles.submitButton}
          disabled={isDisabled}
          onClick={handleSubmit}
        >
          {complement.submitLabel ?? 'Enviar'}
        </button>
      </div>
    </div>
  );
}
