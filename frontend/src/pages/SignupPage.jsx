import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, describeError } from '../api.js';
import { AuthLayout } from '../components/Layouts.jsx';
import { Banner, Button, Field } from '../components/ui.jsx';

const EMPTY = { fullName: '', username: '', email: '', phone: '', password: '', confirmPassword: '' };

export default function SignupPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (name) => (value) => {
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');

    // Quick checks so obvious mistakes are caught instantly. The server repeats and enforces every rule.
    const nextErrors = {};
    if (!values.fullName.trim()) nextErrors.fullName = 'Full name is required.';
    if (!values.username.trim()) nextErrors.username = 'Username is required.';
    if (!values.email.trim()) nextErrors.email = 'Email is required.';
    if (!values.phone.trim()) nextErrors.phone = 'Phone number is required.';
    if (!values.password) nextErrors.password = 'Password is required.';
    if (!values.confirmPassword) nextErrors.confirmPassword = 'Please confirm your password.';
    else if (values.password !== values.confirmPassword) nextErrors.confirmPassword = 'Passwords do not match.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const data = await api.signup(values);
      navigate('/login', { replace: true, state: { message: data.message, identifier: data.user.username } });
    } catch (err) {
      const { fieldErrors, formError: message } = describeError(err);
      setErrors(fieldErrors);
      setFormError(message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join LibTrack to borrow, renew and reserve books."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <Banner kind="error">{formError && Object.keys(errors).length === 0 ? formError : ''}</Banner>

        <Field label="Full name" name="fullName" value={values.fullName} onChange={set('fullName')} error={errors.fullName} autoComplete="name" autoFocus />
        <div className="field-row">
          <Field
            label="Username"
            name="username"
            value={values.username}
            onChange={set('username')}
            error={errors.username}
            hint="This cannot be changed later."
            autoComplete="username"
          />
          <Field label="Phone number" name="phone" type="tel" inputMode="tel" value={values.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" />
        </div>
        <Field label="Email" name="email" type="email" value={values.email} onChange={set('email')} error={errors.email} autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          hint="At least 8 characters, with a letter and a number."
          autoComplete="new-password"
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          value={values.confirmPassword}
          onChange={set('confirmPassword')}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />
        <Button type="submit" busy={busy}>
          {busy ? 'Creating account...' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
