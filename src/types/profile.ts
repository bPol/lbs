export type Profile = {
  slug: string
  display_name: string
  location?: string
  lat?: number
  lng?: number
  summary?: string
  interests?: string[]
  badges?: string[]
  photo_url?: string
}

export type VerificationRequest = {
  id?: string
  user_uid: string
  user_name: string
  user_email: string
  photo_url: string
  phrase: string
  status: 'pending' | 'approved' | 'rejected'
  created_at?: string
}
