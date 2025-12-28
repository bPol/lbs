export type LocalizedText = Record<string, string>

export type Club = {
  name: string
  slug: string
  city?: string
  country?: string
  country_code?: string
  map_x?: number
  map_y?: number
  lat?: number
  lng?: number
  summary: LocalizedText | string
}

export type Website = {
  name: string
  url: string
  type: LocalizedText | string
  status: LocalizedText | string
  summary: LocalizedText | string
}

export type Post = {
  id?: string
  slug: string
  title: LocalizedText | string
  date: LocalizedText | string
  excerpt: LocalizedText | string
  meta: [LocalizedText | string, LocalizedText | string]
  body: LocalizedText | string
  published_at?: string
  legacy_url?: string
}

export type ModerationPost = Post & {
  id: string
  status: string
  author_name?: string
  author_email?: string
  created_at?: string
}

export type Review = {
  id?: string
  club_slug: string
  author_type: 'user' | 'constellation'
  author_slug: string
  rating: number
  status: string
  text: string
  date?: string
  country?: string
  country_code?: string
  city?: string
  date_visited?: string
  dress_code?: string
  website?: string
  party_type?: string
  day_of_week?: string
  ratings?: Record<string, number>
}
