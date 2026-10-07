import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/contexts'
import { DEMO } from '../config'
import { validateEmail, validatePassword, validateUsername } from '../lib/validate'
import { DemoLoginsLazy } from '../components/demoLazy'

function Field({ id, label, error, hint, ...input }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={!!error} aria-describedby={`${id}-msg`} {...input} />
      <p id={`${id}-msg`} className={error ? 'field-error' : 'hint'} role={error ? 'alert' : undefined}>{error || hint || ''}</p>
    </div>
  )
}

export default function Auth({ mode }) {
  const register = mode === 'register'
  const { user, login, register: signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/'
  const [values, setValues] = useState({ username: '', email: '', identifier: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={from} replace />

  const set = (k) => (e) => {
    setValues((v) => ({ ...v, [k]: e.target.value }))
    setErrors((x) => ({ ...x, [k]: '' }))
    setFormError('')
  }

  const check = (v) => {
    const e = register
      ? { username: validateUsername(v.username), email: validateEmail(v.email), password: validatePassword(v.password) }
      : { identifier: v.identifier.trim() ? '' : 'Enter your username or email.', password: v.password ? '' : 'Enter your password.' }
    setErrors(e)
    return !Object.values(e).some(Boolean)
  }

  const submit = async (e, override) => {
    e?.preventDefault()
    const v = override || values
    if (!check(v)) return
    setBusy(true)
    setFormError('')
    try {
      if (register) await signUp(v.username.trim(), v.email.trim(), v.password)
      else await login(v.identifier.trim(), v.password)
      navigate(from, { replace: true })
    } catch (err) {
      setFormError(err.message)
      setBusy(false)
    }
  }

  const pick = (username, password) => {
    const v = { ...values, identifier: username, password }
    setValues(v)
    setErrors({})
    submit(null, v)
  }

  return (
    <div className="auth">
      <div className="card auth-card">
        <h1>{register ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted">{register ? 'Join Orbit to post, follow and comment.' : 'Log in to see your feed.'}</p>
        <form onSubmit={submit} noValidate>
          {register ? (
            <>
              <Field id="username" label="Username" value={values.username} onChange={set('username')} error={errors.username} autoComplete="username" hint="3-30 letters, numbers or underscores." />
              <Field id="email" label="Email" type="email" value={values.email} onChange={set('email')} error={errors.email} autoComplete="email" placeholder="you@example.com" />
            </>
          ) : (
            <Field id="identifier" label="Username or email" value={values.identifier} onChange={set('identifier')} error={errors.identifier} autoComplete="username" placeholder="you@example.com" />
          )}
          <Field id="password" label="Password" type="password" value={values.password} onChange={set('password')} error={errors.password} autoComplete={register ? 'new-password' : 'current-password'} hint={register ? 'At least 6 characters.' : ''} />
          <p className="field-error form-error" role="alert">{formError}</p>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait...' : register ? 'Sign up' : 'Log in'}</button>
        </form>
        <p className="auth-switch muted">
          {register ? <>Already have an account? <Link to="/login" state={location.state}>Log in</Link></> : <>New here? <Link to="/register" state={location.state}>Create an account</Link></>}
        </p>
        {DEMO && !register && <DemoLoginsLazy onPick={pick} />}
      </div>
    </div>
  )
}
