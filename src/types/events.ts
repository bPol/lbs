export type EventPrivacyTier = 'Public' | 'Vetted' | 'Private'

export type EventCap = {
  men: number
  women: number
  couples: number
}

export type Event = {
  title: string
  slug: string
  date: string
  city: string
  privacy_tier: EventPrivacyTier
  address?: string
  lat?: number
  lng?: number
  host_name: string
  host_email: string
  cap: EventCap
  summary: string
  invited_emails?: string[]
}

export type EventRsvp = {
  id?: string
  event_slug: string
  user_uid: string
  user_name: string
  user_email: string
  category: keyof EventCap
  status: 'Pending' | 'Approved' | 'Declined'
  trust_badges?: string[]
  checkin_token?: string
  created_at?: string
}

export type LiveStatusKey = 'open' | 'full' | 'last_call'
