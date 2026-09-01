'use client';

import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import styles from '@/components/pages/ProductsPage.module.css';

export function ProductsInventoryLiveToggle({
  enabled,
  threshold,
  saving,
  error,
  onEnabledChange,
  onThresholdChange,
  onThresholdCommit,
}: {
  enabled: boolean;
  threshold: number;
  saving: boolean;
  error: string | null;
  onEnabledChange: (enabled: boolean) => void;
  onThresholdChange: (threshold: number) => void;
  onThresholdCommit: (threshold?: number) => void;
}) {
  const setThreshold = (next: number, commit: boolean) => {
    const value = Math.max(1, next);
    onThresholdChange(value);
    if (commit) onThresholdCommit(value);
  };

  return (
    <div className={styles.inventoryToolbar}>
      <div className={styles.inventoryToolbarCopy}>
        <div className={styles.inventoryToolbarLabel}>
          <Inventory2OutlinedIcon fontSize="small" aria-hidden />
          <span>Reflejar inventario en menú live</span>
          {saving ? <span className={styles.inventorySaving}>Guardando…</span> : null}
        </div>
        <p className={styles.inventoryToolbarHint} id="inventory-live-hint">
          Stock baja cuando cocina acepta un pedido y el menú live avisa si quedan pocas.
        </p>
        <p className={styles.srOnly} id="low-stock-hint">
          En el menú, el cliente ve que quedan pocas cuando el stock llega a este número.
        </p>
        {error ? (
          <p className={styles.inventoryToolbarError} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className={styles.lowStockField}>
        <label className={styles.lowStockLabel} htmlFor="low-stock-threshold">
          Pocas piezas a partir de
        </label>
        <div className={styles.lowStockControls}>
          <button
            type="button"
            className={styles.lowStockStepBtn}
            aria-label="Bajar umbral de piezas"
            disabled={saving || threshold <= 1}
            onClick={() => setThreshold(threshold - 1, true)}
          >
            −
          </button>
          <input
            id="low-stock-threshold"
            className={styles.lowStockInput}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            autoComplete="off"
            value={threshold}
            disabled={saving}
            aria-describedby="low-stock-hint"
            onChange={(event) =>
              setThreshold(Number.parseInt(event.target.value, 10) || 1, false)
            }
            onBlur={() => onThresholdCommit(threshold)}
          />
          <button
            type="button"
            className={styles.lowStockStepBtn}
            aria-label="Subir umbral de piezas"
            disabled={saving}
            onClick={() => setThreshold(threshold + 1, true)}
          >
            +
          </button>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Reflejar inventario en menú live"
        aria-describedby="inventory-live-hint"
        className={`${styles.inventorySwitch} ${enabled ? styles.inventorySwitchOn : ''}`}
        disabled={saving}
        onClick={() => onEnabledChange(!enabled)}
      >
        <span className={styles.inventorySwitchThumb} />
      </button>
    </div>
  );
}
