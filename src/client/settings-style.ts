/** Inject the once-only card chrome stylesheet. */
export function ensureCardStyle(): void {
  if (document.getElementById('dsn-notify-card-style') !== null) return
  const style = document.createElement('style')
  style.id = 'dsn-notify-card-style'
  style.textContent = `
    .dsn-card { list-style: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-3); transition: border-color .16s, background .16s; }
    .dsn-card:hover { border-color: var(--dsw-alias-label-dimmed); }
    .dsn-cardOpen { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-label-dimmed); }
    .dsn-header { width: 100%; height: auto; min-height: 64px; white-space: normal; appearance: none; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; }
    .dsn-header:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
    .dsn-headText { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .dsn-name { font-size: 15px; font-weight: 600; line-height: 1.4; color: var(--dsw-alias-label-primary); }
    .dsn-description { font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
    .dsn-chevron { flex: none; color: var(--dsw-alias-label-tertiary); transition: transform .16s; }
    .dsn-chevronOpen { transform: rotate(180deg); }
    .dsn-body { border-top: 1px solid var(--dsw-alias-border-l2); margin: 0 16px; padding-bottom: 8px; }
    .dsn-readOnly { margin: 12px 0 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
    .dsn-pending { flex: none; border-radius: 999px; padding: 1px 8px; font-size: 11px; line-height: 17px; font-weight: 500; white-space: nowrap; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); }
    .dsn-field { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
    .dsn-field + .dsn-field { border-top: 1px solid var(--dsw-alias-border-l2); }
    .dsn-section { margin-top: 4px; font-size: 13px; font-weight: 600; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
    .dsn-input { box-sizing: border-box; display: flex; width: 100%; min-width: 0; height: 32px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; }
    .dsn-input:focus-within { border-color: var(--dsw-alias-brand-primary); }
    .dsn-input:has(input:disabled) { opacity: .5; cursor: default; }
    .dsn-input input:disabled { cursor: default; }
    .dsn-method { height: 32px; justify-content: space-between; gap: 16px; border-radius: 8px; }
    .dsn-headerRow > .dsn-headerName { width: 42%; }
    .dsn-headerRow > .dsn-headerValue { width: 58%; }
    .dsn-textarea { box-sizing: border-box; width: 100%; min-height: 72px; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; line-height: 22px; resize: vertical; }
    .dsn-textarea::placeholder { color: var(--dsw-alias-label-dimmed); }
    .dsn-textarea:focus-visible { outline: none; border-color: var(--dsw-alias-brand-primary); }
    .dsn-textarea:disabled { opacity: .5; cursor: default; }
    .dsn-headerRow { display: flex; align-items: center; gap: 8px; }
    .dsn-headerName { flex: 0 1 42%; }
    .dsn-headerValue { flex: 1 1 58%; }
    .dsn-toggleRow { display: flex; align-items: center; gap: 12px; }
    .dsn-toggleLabel { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--dsw-alias-label-primary); }
    .dsn-hint { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
    .dsn-statusRow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .dsn-statusLabel { font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--dsw-alias-label-primary); }
    .dsn-badge { flex: none; border-radius: 999px; padding: 1px 8px; font-size: 11px; line-height: 17px; font-weight: 500; white-space: nowrap; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); }
    .dsn-badgeOk { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-brand-primary); }
    .dsn-badgeBad { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-error); }
    .dsn-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .dsn-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 0 4px; border-top: 1px solid var(--dsw-alias-border-l2); }
    .dsn-failed { flex: 1; min-width: 0; margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-error); }
    @media (prefers-reduced-motion: reduce) { .dsn-card, .dsn-chevron { transition: none; } }
  `
  document.head.appendChild(style)
}
