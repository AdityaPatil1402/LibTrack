import { useId, useState } from 'react';

export function Logo({ size = 32 }) {
  // Each logo needs its own gradient id: a gradient defined inside a hidden (display: none) copy
  // cannot be used by another SVG on the page.
  const gradientId = `lt-grad-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f8cff" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path d="M9 9.5h5.5a2.5 2.5 0 0 1 2.5 2.5v11a2 2 0 0 0-2-2H9z" fill="#fff" fillOpacity=".95" />
      <path d="M23 9.5h-5.5A2.5 2.5 0 0 0 15 12v11a2 2 0 0 1 2-2h6z" fill="#fff" fillOpacity=".6" />
    </svg>
  );
}

export function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  error,
  hint,
  autoComplete,
  inputMode,
  readOnly = false,
  autoFocus = false,
  placeholder,
}) {
  const [shown, setShown] = useState(false);
  const id = `field-${name}`;
  const isPassword = type === 'password';
  const messageId = `${id}-msg`;

  return (
    <div className={`field${error ? ' has-error' : ''}${readOnly ? ' is-readonly' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          id={id}
          name={name}
          type={isPassword && shown ? 'text' : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          readOnly={readOnly}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error || hint ? messageId : undefined}
        />
        {isPassword && (
          <button
            type="button"
            className="reveal"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? 'Hide password' : 'Show password'}
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {error ? (
        <p className="field-msg error" id={messageId}>
          {error}
        </p>
      ) : hint ? (
        <p className="field-msg" id={messageId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Button({ children, busy = false, variant = 'primary', ...rest }) {
  return (
    <button className={`btn btn-${variant}`} disabled={busy || rest.disabled} {...rest}>
      {busy && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Banner({ kind = 'error', children }) {
  if (!children) return null;
  return (
    <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function FullScreenSpinner() {
  return (
    <div className="center-screen" role="status" aria-label="Loading">
      <span className="spinner spinner-lg" />
    </div>
  );
}
