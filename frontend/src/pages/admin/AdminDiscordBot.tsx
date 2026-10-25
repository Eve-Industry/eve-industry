import { useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { errorMessage, fieldError, useDiscordBot, useUpdateDiscordBot } from '../../api/admin'
import type { components } from '../../api/schema'
import { AdminError } from '../../components/AdminGuard'

type Settings = components['schemas']['DiscordBotSettingsResource']

function Help({ children }: { children: ReactNode }) {
  return <span className="muted small">{children}</span>
}

function BotForm({ settings }: { settings: Settings }) {
  const update = useUpdateDiscordBot()
  const [enabled, setEnabled] = useState(settings.is_enabled)
  const [token, setToken] = useState('')
  const [clearToken, setClearToken] = useState(false)
  const [name, setName] = useState(settings.bot_name)
  const [avatar, setAvatar] = useState(settings.bot_avatar_url ?? '')
  const [channel, setChannel] = useState(settings.welcome_channel_id ?? '')
  const [message, setMessage] = useState(settings.welcome_message)

  function submit(e: FormEvent) {
    e.preventDefault()
    update.mutate(
      {
        is_enabled: enabled,
        bot_token: token || null,
        clear_bot_token: clearToken,
        bot_name: name,
        bot_avatar_url: avatar || null,
        welcome_channel_id: channel || null,
        welcome_message: message,
      },
      {
        onSuccess: () => {
          setToken('')
          setClearToken(false)
        },
      },
    )
  }

  const error = (field: string) => fieldError(update.error, field)
  const shown = update.data?.data ?? settings
  return (
    <div className="two-col">
      <form className="scan-form panel" onSubmit={submit}>
        <h2>Bot configuration</h2>
        <label className="check">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enable the Discord welcome bot
        </label>
        <Help>When enabled, the bot sends a welcome message whenever a new member joins the server.</Help>

        <div className="scan-field">
          <label htmlFor="bot-token">Bot token</label>
          <input id="bot-token" type="password" autoComplete="new-password" value={token} disabled={clearToken} onChange={(e) => setToken(e.target.value)} placeholder={settings.has_bot_token ? 'Stored: leave empty to keep it' : 'Your Discord bot token'} aria-invalid={!!error('bot_token')} />
          {error('bot_token') ? <span role="alert" className="field-error">{error('bot_token')}</span> : null}
          <Help>The token is never shown again once saved. Enable the Server Members Intent so the bot can see joins.</Help>
          {settings.has_bot_token ? (
            <label className="check">
              <input type="checkbox" checked={clearToken} onChange={(e) => setClearToken(e.target.checked)} /> Remove the stored token
            </label>
          ) : null}
        </div>

        <div className="scan-field">
          <label htmlFor="bot-name">Bot display name</label>
          <input id="bot-name" value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} aria-invalid={!!error('bot_name')} />
          {error('bot_name') ? <span role="alert" className="field-error">{error('bot_name')}</span> : null}
        </div>

        <div className="scan-field">
          <label htmlFor="bot-avatar">Bot avatar URL (optional)</label>
          <input id="bot-avatar" type="url" value={avatar} maxLength={512} placeholder="https://example.com/avatar.png" onChange={(e) => setAvatar(e.target.value)} aria-invalid={!!error('bot_avatar_url')} />
          {error('bot_avatar_url') ? <span role="alert" className="field-error">{error('bot_avatar_url')}</span> : null}
        </div>

        <div className="scan-field">
          <label htmlFor="bot-channel">Welcome channel ID</label>
          <input id="bot-channel" value={channel} maxLength={20} placeholder="123456789012345678" onChange={(e) => setChannel(e.target.value)} aria-invalid={!!error('welcome_channel_id')} />
          {error('welcome_channel_id') ? <span role="alert" className="field-error">{error('welcome_channel_id')}</span> : null}
          <Help>Right-click a channel in Discord and choose Copy Channel ID (turn on Developer Mode in Discord first).</Help>
        </div>

        <div className="scan-field">
          <label htmlFor="bot-message">Welcome message</label>
          <textarea id="bot-message" rows={4} maxLength={2000} required value={message} onChange={(e) => setMessage(e.target.value)} aria-invalid={!!error('welcome_message')} />
          {error('welcome_message') ? <span role="alert" className="field-error">{error('welcome_message')}</span> : null}
          <Help>Use {'{user}'} for the mention of the new member. Up to 2000 characters.</Help>
        </div>

        {update.isError && !(update.error instanceof ApiError && update.error.errors) ? (
          <p role="alert" className="field-error">
            {errorMessage(update.error, 'Could not save the settings.')}
          </p>
        ) : null}
        {update.isSuccess ? <p role="status">Discord bot settings updated.</p> : null}
        <div className="page-actions">
          <button type="submit" className="button" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>

      <aside>
        <section className="panel">
          <h2>Setup guide</h2>
          <ol>
            <li>
              Create an application in the{' '}
              <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer">
                Discord Developer Portal
              </a>
              .
            </li>
            <li>Under Bot, create a bot and copy its token.</li>
            <li>Enable the Server Members Intent (Privileged Gateway Intents).</li>
            <li>Invite the bot with the OAuth2 URL generator: scope bot, permission Send Messages.</li>
            <li>Paste the token and configure the settings here.</li>
            <li>
              Run <code>php artisan discord:bot</code> on the server to start the bot.
            </li>
          </ol>
        </section>
        {shown.has_bot_token ? (
          <section className="panel" aria-label="Current status">
            <h2>Current status</h2>
            <p>
              <span className={`badge ${shown.is_enabled ? 'badge-fresh' : ''}`}>{shown.is_enabled ? 'Enabled' : 'Disabled'}</span> <strong>{shown.bot_name}</strong>
            </p>
            <p className={shown.welcome_channel_id ? 'muted small' : 'small text-warn'}>
              {shown.welcome_channel_id ? `Channel ID: ${shown.welcome_channel_id}` : 'No welcome channel configured.'}
            </p>
          </section>
        ) : null}
      </aside>
    </div>
  )
}

export default function AdminDiscordBot() {
  const bot = useDiscordBot()
  return (
    <>
      <div className="page-head">
        <h1>Discord bot settings</h1>
      </div>
      {bot.isPending ? <p>Loading…</p> : bot.isError ? <AdminError error={bot.error} what="the bot settings" /> : <BotForm settings={bot.data.data} />}
    </>
  )
}
