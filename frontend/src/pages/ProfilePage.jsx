import { useState } from 'react';
import { api, describeError } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Banner, Button, Field } from '../components/ui.jsx';

export default function ProfilePage() {
  return (
    <>
      <div className="page-head">
        <h1>Profile</h1>
        <p>Manage your contact details and password.</p>
      </div>
      <div className="stack">
        <DetailsCard />
        <PasswordCard />
      </div>
    </>
  );
}

function DetailsCard() {
  const { user, setUser } = useAuth();
  const [values, setValues] = useState({ fullName: user.fullName, email: user.email, phone: user.phone ?? '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (name) => (value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setSaved('');
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const unchanged =
    values.fullName === user.fullName && values.email === user.email && values.phone === (user.phone ?? '');

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    setSaved('');
    setBusy(true);
    try {
      const data = await api.updateProfile(values);
      setUser(data.user);
      setValues({ fullName: data.user.fullName, email: data.user.email, phone: data.user.phone ?? '' });
      setErrors({});
      setSaved(data.message);
    } catch (err) {
      const { fieldErrors, formError: message } = describeError(err);
      setErrors(fieldErrors);
      setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Your details</h2>
      <form onSubmit={onSubmit} noValidate>
        <Banner kind="success">{saved}</Banner>
        <Banner kind="error">{formError && Object.keys(errors).length === 0 ? formError : ''}</Banner>

        <Field
          label="Username"
          name="profile-username"
          value={user.username}
          onChange={() => {}}
          readOnly
          hint="Your username is permanent and cannot be changed."
        />
        <Field label="Full name" name="profile-fullName" value={values.fullName} onChange={set('fullName')} error={errors.fullName} autoComplete="name" />
        <div className="field-row">
          <Field label="Email" name="profile-email" type="email" value={values.email} onChange={set('email')} error={errors.email} autoComplete="email" />
          <Field label="Phone number" name="profile-phone" type="tel" inputMode="tel" value={values.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" />
        </div>
        <Button type="submit" busy={busy} disabled={unchanged}>
          {busy ? 'Saving...' : 'Save changes'}
        </Button>
      </form>
    </section>
  );
}

const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirmNewPassword: '' };

function PasswordCard() {
  const [values, setValues] = useState(EMPTY_PASSWORDS);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (name) => (value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setDone('');
    if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
  };

  async function onSubmit(event) {
    event.preventDefault();
    setFormError('');
    setDone('');

    const nextErrors = {};
    if (!values.currentPassword) nextErrors.currentPassword = 'Enter your current password.';
    if (!values.newPassword) nextErrors.newPassword = 'Enter a new password.';
    if (!values.confirmNewPassword) nextErrors.confirmNewPassword = 'Please confirm your new password.';
    else if (values.newPassword !== values.confirmNewPassword) nextErrors.confirmNewPassword = 'Passwords do not match.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const data = await api.changePassword(values);
      setValues(EMPTY_PASSWORDS);
      setErrors({});
      setDone(data.message);
    } catch (err) {
      const { fieldErrors, formError: message } = describeError(err);
      setErrors(fieldErrors);
      setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Change password</h2>
      <p className="muted">Changing your password signs you out on all other devices.</p>
      <form onSubmit={onSubmit} noValidate>
        <Banner kind="success">{done}</Banner>
        <Banner kind="error">{formError && Object.keys(errors).length === 0 ? formError : ''}</Banner>

        <Field label="Current password" name="currentPassword" type="password" value={values.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} autoComplete="current-password" />
        <Field
          label="New password"
          name="newPassword"
          type="password"
          value={values.newPassword}
          onChange={set('newPassword')}
          error={errors.newPassword}
          hint="At least 8 characters, with a letter and a number."
          autoComplete="new-password"
        />
        <Field label="Confirm new password" name="confirmNewPassword" type="password" value={values.confirmNewPassword} onChange={set('confirmNewPassword')} error={errors.confirmNewPassword} autoComplete="new-password" />
        <Button type="submit" busy={busy}>
          {busy ? 'Updating...' : 'Update password'}
        </Button>
      </form>
    </section>
  );
}
