import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { describeError } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthLayout } from '../components/Layouts.jsx';
import { Banner, Button, Field } from '../components/ui.jsx';

export default function LoginPage() {
  const { login, notice, clearNotice } = useAuth();
  const location = useLocation();

  const [identifier, setIdentifier] = useState(location.state?.identifier ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const successMessage = location.state?.message;

  async function onSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!identifier.trim()) nextErrors.identifier = 'Enter your username or email.';
    if (!password) nextErrors.password = 'Enter your password.';
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      await login(identifier.trim(), password);
      // PublicOnlyRoute now redirects to the dashboard (or the page the person was trying to open).
    } catch (err) {
      const { fieldErrors, formError: message } = describeError(err);
      setErrors(fieldErrors);
      setFormError(message);
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in with your username or email."
      footer={
        <>
          New to LibTrack? <Link to="/signup">Create an account</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <Banner kind="success">{successMessage}</Banner>
        <Banner kind="warning">{notice}</Banner>
        <Banner kind="error">{formError}</Banner>

        <Field
          label="Username or email"
          name="identifier"
          value={identifier}
          onChange={(v) => {
            setIdentifier(v);
            if (notice) clearNotice();
          }}
          error={errors.identifier}
          autoComplete="username"
          autoFocus={!identifier}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="current-password"
          autoFocus={Boolean(identifier)}
        />
        <Button type="submit" busy={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
