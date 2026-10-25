import { act, fireEvent, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { captureInstallPrompt, resetInstallForTests } from '../pwa/install'
import Notifications from './Notifications'
import { renderWithData } from '../test/render'

const mocks = vi.hoisted(() => ({
  update: vi.fn(), enable: vi.fn(), disable: vi.fn(), test: vi.fn(), refresh: vi.fn(),
  device: { state: 'off' as string },
}))

vi.mock('../api/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/notifications')>()),
  useUpdateNotifications: () => ({ mutate: mocks.update, isPending: false, error: null }),
  useEnablePush: () => ({ mutate: mocks.enable, isPending: false, error: null }),
  useDisablePush: () => ({ mutate: mocks.disable, isPending: false, error: null }),
  useSendTestNotification: () => ({ mutate: mocks.test, isPending: false, error: null, data: undefined }),
}))
vi.mock('../pwa/push', () => ({ useDeviceState: () => ({ state: mocks.device.state, refresh: mocks.refresh }) }))

const type = (overrides: Record<string, unknown>) => ({
  key: 'x', label: 'X', description: 'desc', category: 'Industry', available: true, enabled: false, default_enabled: false,
  lead_minutes: null, lead_options: null, supports_characters: false, character_ids: [], ...overrides,
})

const config = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  vapid_public_key: 'PUBLICKEY',
  devices: 1,
  quiet_hours: { start: null, end: null, timezone: 'UTC' },
  types: [
    type({ key: 'industry.job_completed', label: 'Industry job completed', enabled: true, default_enabled: true, supports_characters: true }),
    type({ key: 'pi.extractor_expiring', label: 'Planetary extractor expiring', category: 'Planetary', lead_minutes: 60, lead_options: [15, 60, 360], supports_characters: true }),
    type({ key: 'structure.timer', label: 'Structure timer ending', category: 'Corporation', available: false }),
  ],
  ...overrides,
})

const me = { data: { characters: [{ character_id: 1, name: 'Alpha' }, { character_id: 2, name: 'Beta' }] } }
const render = (data = config()) => renderWithData(<Notifications />, [[['notifications'], data], [['me'], me]])

beforeEach(() => {
  vi.clearAllMocks()
  mocks.device.state = 'off'
})

it('groups every type by category and shows the defaults', () => {
  render()
  expect(screen.getByRole('region', { name: 'Industry' })).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /Industry job completed/ })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: /Planetary extractor expiring/ })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: /Structure timer ending/ })).toBeDisabled()
  expect(screen.getByText('Needs a character in a corporation.')).toBeInTheDocument()
})

it('sends only the changed type when toggled', () => {
  render()
  fireEvent.click(screen.getByRole('checkbox', { name: /Planetary extractor expiring/ }))
  expect(mocks.update).toHaveBeenCalledWith({ types: { 'pi.extractor_expiring': { enabled: true } } })
})

it('offers a lead time for enabled types that have one', () => {
  const data = config()
  data.types[1] = type({ key: 'pi.extractor_expiring', label: 'Planetary extractor expiring', category: 'Planetary', enabled: true, lead_minutes: 60, lead_options: [15, 60, 360], supports_characters: true })
  render(data)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '360' } })
  expect(mocks.update).toHaveBeenCalledWith({ types: { 'pi.extractor_expiring': { lead_minutes: 360 } } })
  expect(screen.getByRole('option', { name: '6 hours before' })).toBeInTheDocument()
})

it('limits a type to chosen characters and treats none selected as all', () => {
  render()
  const industry = screen.getByRole('region', { name: 'Industry' })
  fireEvent.click(within(industry).getByRole('checkbox', { name: 'Alpha' }))
  expect(mocks.update).toHaveBeenCalledWith({ types: { 'industry.job_completed': { character_ids: [2] } } })
})

it('asks the browser to subscribe with the server key when enabling this device', () => {
  render()
  fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }))
  expect(mocks.enable).toHaveBeenCalledWith('PUBLICKEY', expect.any(Object))
})

it('offers a test and turning off when this device is subscribed', () => {
  mocks.device.state = 'on'
  render()
  fireEvent.click(screen.getByRole('button', { name: 'Send a test' }))
  fireEvent.click(screen.getByRole('button', { name: 'Turn off on this device' }))
  expect(mocks.test).toHaveBeenCalledOnce()
  expect(mocks.disable).toHaveBeenCalledOnce()
})

it.each([
  ['unsupported', /cannot receive push notifications/],
  ['denied', /blocked for this site/],
])('explains a %s browser instead of offering to enable', (state, text) => {
  mocks.device.state = state
  render()
  expect(screen.getByText(text)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Enable notifications' })).not.toBeInTheDocument()
})

it('says so when the server has no VAPID keys', () => {
  render(config({ enabled: false, vapid_public_key: null }))
  expect(screen.getByText(/not configured on this server/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Enable notifications' })).not.toBeInTheDocument()
})

it('saves and clears quiet hours', () => {
  render()
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '22:00' } })
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '07:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save quiet hours' }))
  expect(mocks.update).toHaveBeenCalledWith({ quiet_hours: { start: '22:00', end: '07:00', timezone: 'UTC' } }, expect.any(Object))
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  expect(mocks.update).toHaveBeenLastCalledWith({ quiet_hours: { start: null, end: null } }, expect.any(Object))
})

describe('installing from this page', () => {
  beforeEach(() => {
    localStorage.clear()
    resetInstallForTests()
    captureInstallPrompt()
  })

  const offerInstall = () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    act(() => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }),
      }))
    })
    return prompt
  }

  it('offers an install button that enables notifications once the app is installed', async () => {
    mocks.device.state = 'unsupported'
    render()
    expect(screen.queryByRole('button', { name: 'Install app to enable notifications' })).not.toBeInTheDocument()
    const prompt = offerInstall()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Install app to enable notifications' })) })
    expect(prompt).toHaveBeenCalledOnce()
  })

  it('hides the install button when this device already has notifications on', () => {
    mocks.device.state = 'on'
    render()
    offerInstall()
    expect(screen.queryByRole('button', { name: 'Install app to enable notifications' })).not.toBeInTheDocument()
  })
})
