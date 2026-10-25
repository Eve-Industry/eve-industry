import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { errorMessage, fieldError, useAdminAccount, useUpdateAccount } from '../../api/admin'
import { AdminError } from '../../components/AdminGuard'

function Field({ id, label, type = 'text', value, onChange, error, autoComplete }: {
  id: string
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  error?: string
  autoComplete?: string
}) {
  return (
    <div className="scan-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
      {error ? <span role="alert" className="field-error">{error}</span> : null}
    </div>
  )
}

function AccountForm({ email: current }: { email: string }) {
  const update = useUpdateAccount()
  const [email, setEmail] = useState(current)
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    update.mutate(
      { email, ...(password ? { current_password: currentPassword, password, password_confirmation: confirmation } : {}) },
      {
        onSuccess: () => {
          setCurrentPassword('')
          setPassword('')
          setConfirmation('')
        },
      },
    )
  }

  const error = (field: string) => fieldError(update.error, field)
  return (
    <form className="scan-form panel form-narrow" onSubmit={submit}>
      <h2>Email and password</h2>
      <Field id="account-email" label="Email address" type="email" value={email} onChange={setEmail} error={error('email')} autoComplete="email" />
      <p className="muted small">Leave the password fields empty to keep your current password.</p>
      <Field id="account-current" label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} error={error('current_password')} autoComplete="current-password" />
      <Field id="account-new" label="New password" type="password" value={password} onChange={setPassword} error={error('password')} autoComplete="new-password" />
      <Field id="account-confirm" label="Confirm new password" type="password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
      {update.isError && !(update.error instanceof ApiError && update.error.errors) ? (
        <p role="alert" className="field-error">
          {errorMessage(update.error, 'Could not save your settings.')}
        </p>
      ) : null}
      {update.isSuccess ? <p role="status">Settings updated.</p> : null}
      <div className="page-actions">
        <button type="submit" className="button" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

export default function AdminSettings() {
  const account = useAdminAccount()
  return (
    <>
      <div className="page-head">
        <h1>Admin settings</h1>
      </div>
      {account.isPending ? <p>Loading…</p> : account.isError ? <AdminError error={account.error} what="your settings" /> : <AccountForm email={account.data.data.email} />}
    </>
  )
}
