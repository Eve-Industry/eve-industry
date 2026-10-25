import { useMe } from '../api/queries'
import { useCharacterActions } from '../api/account'

export default function Characters() {
  const me = useMe()
  const actions = useCharacterActions()
  if (me.isPending) return <p>Loading characters…</p>
  if (me.isError) return <p role="alert">Could not load your characters.</p>
  const characters = me.data.data.characters
  const demo = me.data.data.demo
  const error = actions.main.error ?? actions.remove.error ?? actions.deleteAccount.error
  const pending = actions.main.isPending || actions.remove.isPending || actions.deleteAccount.isPending
  return (
    <>
      <h1>Characters</h1>
      {demo
        ? <p className="muted">These are generated demo characters. Adding, removing and deleting are turned off.</p>
        : <p><a className="button" href="/auth/eve/scopes">Add character</a></p>}
      {error ? <p role="alert">{error.message}</p> : null}
      {characters.length === 0 ? (
        <p>No characters linked yet.</p>
      ) : (
        <ul className="cards">
          {characters.map((c) => (
            <li key={c.character_id} className="card character-card">
              <img src={c.portrait_url} alt="" width={200} height={200} loading="lazy" />
              <div>
                <strong>{c.name}</strong>
                {c.is_main ? <span className="badge badge-fresh">Main</span> : null}
                <div className="muted">{c.corporation_name ?? 'No corporation'}</div>
                <div className="muted">Alliance: {c.alliance_name ?? '—'}</div>
                <div>Location: {c.cached_location ?? '—'}</div>
                <div>Training: {c.cached_training ?? '—'}</div>
                {!demo && !c.is_esi_active ? <p><a href="/auth/eve/scopes">Renew ESI access</a></p> : null}
                <div className="form-actions stacked">
                  {!demo && !c.is_main ? <button className="button" disabled={pending} onClick={() => actions.main.mutate(c.character_id)}>Set {c.name} as main</button> : null}
                  {!demo && characters.length > 1 ? <button className="button danger" disabled={pending} onClick={() => { if (window.confirm(`Remove ${c.name} from your account?`)) actions.remove.mutate(c.character_id) }}>Remove {c.name}</button> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {demo ? null : <section className="panel warn" aria-labelledby="delete-account-heading">
        <h2 id="delete-account-heading">Delete account</h2>
        <p>Permanently delete your account and linked characters, and revoke their EVE SSO tokens. This cannot be undone.</p>
        <button className="button danger" disabled={pending} onClick={() => { if (window.confirm('Permanently delete your account, all characters and EVE SSO tokens? This cannot be undone.')) actions.deleteAccount.mutate() }}>Delete my account</button>
      </section>}
    </>
  )
}
