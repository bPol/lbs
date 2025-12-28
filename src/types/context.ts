import type { Club, LocalizedText, ModerationPost, Post, Review, Website } from './content'
import type { Event, EventCap, EventRsvp } from './events'
import type { Profile, VerificationRequest } from './profile'
import type { Constellation, RelationshipLink } from './relationships'

export type AppContext = {
  clubs: Club[]
  websites: Website[]
  posts: Post[]
  reviews: Review[]
  constellations: Constellation[]
  profiles: Profile[]
  events: Event[]
  relationshipLinks: RelationshipLink[]
  pendingLinkRequests: RelationshipLink[]
  verificationRequests: VerificationRequest[]
  clubNames: Record<string, string>
  authStatus: string
  authUser: string | null
  authEmail: string | null
  authUid: string | null
  handleAuthClick: () => Promise<void>
  handleEmailSignIn: (details: { email: string; password: string }) => Promise<void>
  handleGoogleRegisterStart: () => Promise<{
    ok: boolean
    message?: string
    user?: { displayName: string; email: string }
    birthDate?: string
  }>
  handleRegister: (details: {
    displayName: string
    email: string
    password: string
    birthDate: string
    location: string
    interests: string[]
    consentAge: boolean
    consentPrivacy: boolean
    consentPolicy: boolean
  }) => Promise<void>
  handleGoogleRegister: (details: {
    displayName: string
    email: string
    birthDate: string
    location: string
    interests: string[]
    consentAge: boolean
    consentPrivacy: boolean
    consentPolicy: boolean
  }) => Promise<void>
  registerStatus: string
  signInStatus: string
  registerLoading: boolean
  signInLoading: boolean
  handleReviewSubmit: (details: {
    club: Club
    rating: number
    text: string
    anonymous?: boolean
  }) => Promise<{ ok: boolean; message: string }>
  handleClubSubmit: (details: {
    name: string
    city: string
    country: string
    website: string
    summary: string
  }) => Promise<{ ok: boolean; message: string }>
  handleReviewModeration: (reviewId: string, status: 'approved' | 'rejected') => Promise<void>
  handleBlogModeration: (
    postId: string,
    status: 'published' | 'pending' | 'rejected'
  ) => Promise<void>
  handleBlogSave: (details: {
    id?: string
    slug: string
    title: LocalizedText | string
    date: LocalizedText | string
    excerpt: LocalizedText | string
    meta: [LocalizedText | string, LocalizedText | string]
    body: LocalizedText | string
    legacy_url?: string
    status: 'published' | 'pending'
  }) => Promise<{ ok: boolean; message: string }>
  pendingReviews: Review[]
  pendingBlogPosts: ModerationPost[]
  pendingEventRsvps: EventRsvp[]
  isAdmin: boolean
  firebaseConfigured: boolean
  handleProfileLoad: () => Promise<{
    ok: boolean
    message?: string
    data?: {
      displayName?: string
      birthDate?: string
      location?: string
      locationLat?: string
      locationLng?: string
      interests?: string[]
      consentPrivacy?: boolean
      photoUrl?: string
    }
  }>
  handleProfileUpdate: (details: {
    displayName: string
    birthDate: string
    location: string
    locationLat: string
    locationLng: string
    interests: string[]
    consentPrivacy: boolean
  }) => Promise<{ ok: boolean; message: string }>
  handleLinkRequest: (details: {
    email: string
    linkType: RelationshipLink['link_type']
  }) => Promise<{ ok: boolean; message: string }>
  handleLinkResponse: (
    linkId: string,
    status: 'Confirmed' | 'Rejected'
  ) => Promise<void>
  handleLinkVisibility: (linkId: string, mergeVisibility: boolean) => Promise<void>
  subscribeEventRsvps: (
    eventSlug: string,
    onUpdate: (rsvps: EventRsvp[]) => void
  ) => (() => void) | null
  handleEventRsvpSubmit: (
    event: Event,
    category: keyof EventCap
  ) => Promise<{ ok: boolean; message: string }>
  handleEventRsvpUpdate: (
    rsvpId: string,
    status: 'Approved' | 'Declined'
  ) => Promise<void>
  handleEventCheckin: (details: {
    token: string
    eventSlug: string
  }) => Promise<{ ok: boolean; message: string }>
  handlePhotoUpload: (file: File) => Promise<{ ok: boolean; url?: string; message: string }>
  handleNotificationsEnable: () => Promise<{ ok: boolean; message: string; token?: string }>
  handleNotificationsDisable: () => Promise<{ ok: boolean; message: string }>
  handleVerificationSubmit: (file: File) => Promise<{ ok: boolean; message: string }>
  handleVerificationModeration: (
    requestId: string,
    status: 'approved' | 'rejected'
  ) => Promise<void>
  handleAccountDelete: () => Promise<{ ok: boolean; message: string }>
  safetyMode: boolean
  setSafetyMode: (next: boolean) => void
  userHasRsvp: boolean
}
