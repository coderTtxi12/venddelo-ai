'use client';

import { useId } from 'react';
import { FormSelect } from '@/components/ui/FormSelect';
import styles from './ToolbarSelect.module.css';

type ToolbarSelectProps<T extends string> = {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
  active?: boolean;
};

export function ToolbarSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  active = false,
}: ToolbarSelectProps<T>) {
  const labelId = useId();
  const selectId = useId();
  const formOptions = (Object.keys(options) as T[]).map((option) => ({
    value: option,
    label: options[option],
  }));

  return (
    <div className={styles.field}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <FormSelect
        id={selectId}
        value={value}
        options={formOptions}
        onChange={(next) => onChange(next as T)}
        aria-labelledby={labelId}
        variant="compact"
        active={active}
      />
    </div>
  );
}
