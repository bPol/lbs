import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom'
import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
} from 'firebase/auth'
import {
  getFirestore,
  serverTimestamp,
  setDoc,
  doc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import {
  deleteToken,
  getMessaging,
  getToken,
  onMessage,
} from 'firebase/messaging'
import { io, type Socket } from 'socket.io-client'
import L from 'leaflet'

const firebaseConfig = {
  apiKey: 'AIzaSyCCIsslSCpOwkHhvFfK41noNkplEcw0pfk',
  authDomain: 'ledbyswing.firebaseapp.com',
  projectId: 'ledbyswing',
  storageBucket: 'ledbyswing.firebasestorage.app',
  messagingSenderId: '68542676788',
  appId: '1:68542676788:web:a3f793148639c8f006ef61',
}

type LocalizedText = Record<string, string>

type Club = {
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

type Website = {
  name: string
  url: string
  type: LocalizedText | string
  status: LocalizedText | string
  summary: LocalizedText | string
}

type Post = {
  title: LocalizedText | string
  date: LocalizedText | string
  excerpt: LocalizedText | string
  meta: [LocalizedText | string, LocalizedText | string]
  url: LocalizedText | string
}

type Constellation = {
  name: string
  slug: string
  city?: string
  members?: string[]
  links?: RelationshipLink[]
}

type RelationshipLink = {
  id?: string
  user_a: string
  user_b: string
  link_type: 'Primary' | 'Play Partner' | 'Polycule Member'
  status: 'Pending' | 'Confirmed' | 'Rejected'
  merge_visibility?: boolean
  user_a_name?: string
  user_b_name?: string
  user_a_email?: string
  user_b_email?: string
}

type Profile = {
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

type EventPrivacyTier = 'Public' | 'Vetted' | 'Private'

type EventCap = {
  men: number
  women: number
  couples: number
}

type Event = {
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

type EventRsvp = {
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

type LiveStatusKey = 'open' | 'full' | 'last_call'

type VerificationRequest = {
  id?: string
  user_uid: string
  user_name: string
  user_email: string
  photo_url: string
  phrase: string
  status: 'pending' | 'approved' | 'rejected'
  created_at?: string
}

type Review = {
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

type AppContext = {
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
  pendingReviews: Review[]
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
  handlePhotoUpload: (file: File) => Promise<{ ok: boolean; url?: string; message: string }>
  handleNotificationsEnable: () => Promise<{ ok: boolean; message: string; token?: string }>
  handleNotificationsDisable: () => Promise<{ ok: boolean; message: string }>
  handleVerificationSubmit: (file: File) => Promise<{ ok: boolean; message: string }>
  handleVerificationModeration: (
    requestId: string,
    status: 'approved' | 'rejected'
  ) => Promise<void>
}

const loadJson = async <T,>(path: string): Promise<T | null> => {
  try {
    const response = await fetch(path, {
      cache: import.meta.env.DEV ? 'no-store' : 'default',
    })
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`)
    }
    return (await response.json()) as T
  } catch (error) {
    console.warn(error)
    return null
  }
}

const parseEventRsvp = (data: Record<string, unknown>, id?: string): EventRsvp => {
  const createdAt = data.created_at as { toDate?: () => Date } | undefined
  return {
    id,
    event_slug: String(data.event_slug || ''),
    user_uid: String(data.user_uid || ''),
    user_name: String(data.user_name || ''),
    user_email: String(data.user_email || ''),
    category: (data.category as keyof EventCap) || 'couples',
    status: (data.status as EventRsvp['status']) || 'Pending',
    trust_badges: Array.isArray(data.trust_badges)
      ? data.trust_badges.map((badge) => String(badge))
      : [],
    checkin_token: typeof data.checkin_token === 'string' ? data.checkin_token : '',
    created_at: createdAt?.toDate?.()?.toISOString(),
  } satisfies EventRsvp
}

const useRevealOnScroll = (deps: unknown[]) => {
  useEffect(() => {
    const elements = document.querySelectorAll('.reveal')
    if (!elements.length) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, index) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement
            target.style.transitionDelay = `${index * 90}ms`
            target.classList.add('is-visible')
          }
        })
      },
      { threshold: 0.2 }
    )

    elements.forEach((element) => observer.observe(element))

    return () => observer.disconnect()
  }, deps)
}

const SUPPORTED_LANGS = ['en', 'pl', 'fr', 'de', 'it', 'es'] as const
type Lang = (typeof SUPPORTED_LANGS)[number]

const getLangFromPath = (pathname: string): Lang => {
  const segment = pathname.split('/')[1] as Lang
  return SUPPORTED_LANGS.includes(segment) ? segment : 'en'
}

const isAdult = (birthDate: string) => {
  const birth = new Date(birthDate)
  if (Number.isNaN(birth.getTime())) {
    return false
  }
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1
  }
  return age >= 18
}

const copy = {
  en: {
    site_tagline: 'Modern communities mapped like constellations.',
    nav_users: 'Users',
    nav_constellations: 'Constellations',
    nav_clubs: 'Clubs',
    nav_events: 'Events',
    nav_map: 'Map',
    nav_websites: 'Websites',
    nav_blog: 'Blog',
    nav_join: 'Join',
    nav_review: 'Review',
    nav_admin: 'Admin',
    user_menu_label: 'Account',
    user_menu_edit: 'Edit profile',
    user_menu_host: 'Host dashboard',
    user_menu_signout: 'Sign out',
    profile_page_title: 'Your profile',
    profile_page_subtitle: 'Update your details and privacy settings.',
    profile_save: 'Save changes',
    profile_saving: 'Saving...',
    profile_saved: 'Profile updated.',
    profile_save_error: 'Unable to update profile. Please try again.',
    profile_signin_prompt: 'Sign in to edit your profile.',
    request_access: 'Request Access',
    link_section_title: 'Constellation links',
    link_section_subtitle:
      'Send requests, confirm consent, and choose how you appear together.',
    link_request_email_label: 'Request by email',
    link_request_email_placeholder: 'partner@email.com',
    link_request_type_label: 'Link type',
    link_request_send: 'Send request',
    link_request_sending: 'Sending...',
    link_request_status_sent: 'Link request sent.',
    link_request_status_missing: 'Enter an email to send a request.',
    link_request_status_self: 'You cannot link to your own email.',
    link_request_status_not_found: 'No user found with that email.',
    link_request_status_exists: 'A link request already exists.',
    link_request_status_error: 'Unable to send request. Please try again.',
    link_requests_incoming_title: 'Incoming requests',
    link_requests_outgoing_title: 'Outgoing requests',
    link_requests_confirmed_title: 'Confirmed links',
    link_requests_empty: 'None yet.',
    link_request_accept: 'Accept',
    link_request_decline: 'Decline',
    link_request_merge_label: 'Merge search visibility',
    link_request_merge_on: 'Merged',
    link_request_merge_off: 'Independent',
    photo_upload_label: 'Profile photo',
    photo_upload_button: 'Upload',
    photo_upload_success: 'Photo updated.',
    photo_upload_error: 'Unable to upload photo.',
    notifications_title: 'Notifications',
    notifications_desc: 'Enable push notifications for invites and updates.',
    notifications_enable: 'Enable notifications',
    notifications_disable: 'Disable notifications',
    notifications_enabled: 'Notifications enabled.',
    notifications_disabled: 'Notifications disabled.',
    notifications_blocked: 'Notifications are blocked in your browser settings.',
    notifications_missing_key: 'Missing VAPID key for notifications.',
    notifications_error: 'Unable to update notifications.',
    verification_title: 'Photo verification',
    verification_desc: 'Upload a selfie holding the verification phrase.',
    verification_phrase_label: 'Verification phrase',
    verification_phrase: 'LBS2025',
    verification_upload_label: 'Verification photo',
    verification_submit: 'Submit verification',
    verification_submitting: 'Submitting...',
    verification_status_pending: 'Verification submitted for review.',
    verification_status_success: 'Verification updated.',
    verification_status_error: 'Unable to submit verification.',
    verification_admin_title: 'Photo verification',
    verification_admin_desc: 'Review submitted selfie verifications.',
    verification_admin_empty: 'No verification requests.',
    verification_admin_approve: 'Approve',
    verification_admin_reject: 'Reject',
    events_page_title: 'Parties & Events',
    events_page_desc: 'See upcoming events, RSVP caps, and host vetting status.',
    event_privacy_label: 'Privacy tier',
    event_privacy_public: 'Public',
    event_privacy_vetted: 'Vetted',
    event_privacy_private: 'Private',
    event_privacy_notice_public: 'Visible to all. Address is shared.',
    event_privacy_notice_vetted:
      'Visible to all. Address shared after host approval.',
    event_privacy_notice_private: 'Invite-only. Hidden from public listings.',
    event_address_label: 'Location',
    event_address_hidden: 'Address hidden until approval.',
    event_cap_label: 'Guest cap',
    event_cap_men: 'Men',
    event_cap_women: 'Women',
    event_cap_couples: 'Couples',
    event_rsvp_title: 'RSVP',
    event_rsvp_desc: 'Pick a category to request a spot.',
    event_rsvp_category_label: 'Category',
    event_rsvp_submit: 'Send RSVP',
    event_rsvp_sending: 'Sending...',
    event_rsvp_full: 'This category is full.',
    event_rsvp_pending: 'RSVP pending host approval.',
    event_rsvp_approved: 'RSVP approved.',
    event_rsvp_declined: 'RSVP declined.',
    event_rsvp_error: 'Unable to send RSVP.',
    event_rsvp_signed_out: 'Sign in to RSVP.',
    event_rsvp_qr_title: 'Check-in QR',
    event_rsvp_qr_desc: 'Show this code at the door for entry.',
    event_guest_manager_title: 'Guest Manager',
    event_guest_manager_desc: 'Review RSVPs and trust badges.',
    event_guest_manager_pending: 'Pending requests',
    event_guest_manager_approved: 'Approved guests',
    event_guest_manager_empty: 'No RSVPs yet.',
    event_guest_action_approve: 'Approve',
    event_guest_action_decline: 'Decline',
    event_not_found_title: 'Event not found',
    event_not_found_body: 'We could not find this event.',
    event_back: 'Back to events',
    event_live_status_label: 'Live status',
    event_live_status_open: 'Open',
    event_live_status_full: 'Full',
    event_live_status_last_call: 'Last call',
    event_live_update: 'Update status',
    event_live_chat_title: 'Live chat',
    event_live_chat_placeholder: 'Type a message...',
    event_live_chat_send: 'Send',
    host_dashboard_title: 'Host dashboard',
    host_dashboard_desc: 'Track RSVPs across your hosted events.',
    host_dashboard_empty: 'No hosted events yet.',
    host_dashboard_signin: 'Sign in to view host tools.',
    footer_tagline: 'Community home for users, constellations, clubs, and stories.',
    footer_guidelines: 'Guidelines & Terms',
    lang_select_label: 'Select language',
    hero_pill: 'Built for creators, clubs, and shared stories',
    hero_title: 'Shape a living network of people, clubs, and unforgettable nights.',
    hero_lead:
      'LedBySwing brings together people, constellations, and clubs with room to share stories, reviews, and travel diaries.',
    hero_paragraph:
      'Welcome to the next evolution of ethical non-monogamy. LedBySwing is a community-built platform designed for the way we actually live. Whether you are a solo explorer, part of an established couple, or a member of a complex constellation, we provide the tools to connect, organize, and thrive. No paywalls, no hidden fees—just an open, adult space dedicated to authentic connection and unforgettable events.',
    relationships_title: 'Your Relationships Are Unique. Your Platform Should Be Too.',
    relationships_body:
      'Traditional sites stop at "Single" or "Couple." We go further. From managing intricate polycules to hosting private events, LedBySwing is designed to handle the beautiful complexity of modern ethical non-monogamy. Bring your constellation home.',
    hero_cta_primary: 'Launch a constellation',
    hero_cta_secondary: 'Explore the graph',
    metric_label: 'Active users',
    metric_caption: 'Growing in 12 regions',
    register_page_title: 'Create your account',
    register_page_subtitle:
      'This creates a single-person account. Couples or constellations can be added later.',
    auth_title: 'Create your account',
    auth_subtitle:
      'Profiles unlock reviews, private event calendars, and invitations from constellations.',
    register_kicker: 'Private community access',
    register_heading: 'Build a profile with intention.',
    register_body:
      'Every account is reviewed. You can browse anonymously, but reviews and invitations require a verified profile.',
    label_display_name: 'Display name',
    label_email: 'Email',
    label_password: 'Password',
    label_confirm_password: 'Confirm password',
    label_birth_date: 'Birth date',
    label_location: 'Location',
    label_location_lat: 'Location latitude',
    label_location_lng: 'Location longitude',
    label_interests: 'Interests',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ characters',
    placeholder_confirm_password: 'Re-enter password',
    placeholder_birth_date: 'YYYY-MM-DD',
    placeholder_location: 'City, Country',
    placeholder_location_lat: '41.38',
    placeholder_location_lng: '2.17',
    placeholder_interests: 'Open relationships, Voyeur, BDSM',
    interest_tag_1: 'Open relationships',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Social events',
    consent_age: 'I confirm I am 18+ (or the legal age of majority in my jurisdiction).',
    consent_privacy: 'Keep my profile private until I choose to publish.',
    consent_policy_prefix: 'I have read and agree to the ',
    consent_policy_link: 'Terms of Service and Community Guidelines',
    consent_policy_suffix: '.',
    register_create: 'Create account',
    register_creating: 'Creating account...',
    register_google_cta: 'Create account with Google',
    register_google_hint: "Use Google to skip password setup. We'll prefill your email.",
    auth_sign_in_google: 'Sign in with Google',
    auth_sign_out: 'Sign out',
    auth_status_setup: 'Sign-in setup required',
    auth_status_config: 'Sign-in configuration required',
    auth_status_pending: 'New accounts are reviewed before launch',
    auth_sign_in_missing: 'Enter your email and password to sign in.',
    auth_sign_in_success: 'Signed in.',
    auth_sign_in_error: 'Unable to sign in. Please try again.',
    register_password_mismatch: 'Passwords do not match.',
    register_underage: 'You must be 18 or older.',
    register_status_success: 'Account created. Pending review before publishing.',
    register_status_permission:
      'Account created, but profile storage is blocked by Firestore rules.',
    register_status_error: 'Unable to create account. Please try again.',
    register_expect_label: 'Expect',
    register_expect_text: 'Thoughtful moderation and verified profiles.',
    register_privacy_label: 'Privacy',
    register_privacy_text: 'Choose what to show before you publish.',
    register_trust_label: 'Trust',
    register_trust_text: 'Reviews are tied to real profiles only.',
    register_have_account: 'Already have an account?',
    register_sign_in: 'Sign in',
    guidelines_page_title: 'Guidelines & Terms',
    guidelines_page_subtitle: 'Please read these policies before joining or hosting events.',
    terms_title: 'Terms of Service (The Legal Guardrails)',
    terms_eligibility_title: 'Eligibility & Age Verification',
    terms_eligibility_item_1:
      '18+ requirement: You must be at least 18 years old (or the legal age of majority in your jurisdiction) to access this site.',
    terms_eligibility_item_2:
      'Verification: We may require age assurance or ID matching to prevent underage access, especially before allowing participation in events.',
    terms_content_title: 'Content Ownership & License',
    terms_content_item_1: 'Your content: You retain ownership of the photos and text you upload.',
    terms_content_item_2:
      'Our license: By posting content, you grant us a non-exclusive, royalty-free license to host and display it for the purpose of operating the service.',
    terms_content_item_3:
      'Copyright (DMCA): We respect intellectual property. If you believe your work has been copied, use our designated takedown process.',
    terms_prohibited_title: 'Prohibited Content & Illegal Acts',
    terms_prohibited_item_1:
      'Zero tolerance: We strictly prohibit facilitation of sex trafficking (FOSTA-SESTA compliance) or any non-consensual sexual content.',
    terms_prohibited_item_2:
      'Illegal acts: Using the platform to promote illegal drugs, violence, or harm is grounds for immediate termination.',
    terms_liability_title: 'Limitation of Liability',
    terms_liability_item_1:
      'As-is service: LedBySwing is provided as-is without warranties of uptime or performance.',
    terms_liability_item_2:
      'Social interaction: We are not responsible for the behavior of users at offline events organized through the site.',
    guidelines_title: 'Community Guidelines (The Vibe & Ethics)',
    guidelines_core_title: 'The C.O.R.E. Principles',
    guidelines_core_item_1:
      'Consent: Verbal, active, and enthusiastic consent is mandatory for all interactions, both digital and physical.',
    guidelines_core_item_2:
      'Openness: We are an inclusive space. We welcome all genders, orientations, and relationship structures (monogamous-ish to complex polycules).',
    guidelines_core_item_3:
      'Respect: Treat others with dignity. Harassment, hunting, or aggressive behavior is not tolerated.',
    guidelines_core_item_4:
      'Ethics: We value transparency. Always be honest about your relationship status and the boundaries of your constellation.',
    guidelines_constellation_title: 'Constellation Etiquette',
    guidelines_constellation_item_1:
      'Linked profiles: When linking accounts into a constellation, ensure all parties have consented to being displayed together.',
    guidelines_constellation_item_2:
      "Privacy: Never share another member's real-world identity or private photos without explicit permission.",
    guidelines_event_title: 'Event Safety',
    guidelines_event_item_1:
      'Host rights: Event organizers have the right to set their own vetting requirements (e.g., ID checks or references) for private gatherings.',
    guidelines_event_item_2:
      'Reporting: If you witness unsafe behavior at an event or on the site, use our Flag tool. We prioritize reports involving non-consensual behavior.',
    users_title: 'The Living Network',
    users_subtitle: 'Explore identities and shared histories that power every connection.',
    users_card_profiles_title: 'Dynamic Profiles',
    users_card_profiles_body: 'Express your true self with flexible roles and deep interests.',
    users_card_profiles_item1: 'Multi-identity tagging',
    users_card_profiles_item2: 'Real-time availability',
    users_card_profiles_item3: 'Intertwined interests',
    users_card_trust_title: 'Vouched Trust',
    users_card_trust_body: 'Safety is built through community, not algorithms.',
    users_card_trust_item1: 'Peer-to-peer vouches',
    users_card_trust_item2: 'Verified event history',
    users_card_trust_item3: 'Community standing',
    users_card_privacy_title: 'Granular Discretion',
    users_card_privacy_body: 'Total control over how you appear to the world.',
    users_card_privacy_item1: 'Selective club visibility',
    users_card_privacy_item2: 'Hidden activity logs',
    users_card_privacy_item3: 'Stealth mode',
    const_title: 'Constellations',
    const_subtitle:
      'Each constellation is a curated set of two or more users with shared intent.',
    const_card_title: 'Collaborative clusters',
    const_card_body:
      'Build constellations for mentorship, co-creation, or launches. Each member adds shared goals and momentum.',
    const_tag1: '2+ users required',
    const_tag2: 'Shared mission',
    const_tag3: 'Time-bounded',
    clubs_title: 'Clubs',
    clubs_subtitle:
      'Independent spaces that host events, publish posts, and seed new constellations.',
    clubs_card1_title: 'Membership arcs',
    clubs_card1_body: 'Tiered access for guests, members, and ambassadors with custom onboarding.',
    clubs_card1_item1: 'Invite-only entries',
    clubs_card1_item2: 'Event check-ins',
    clubs_card1_item3: 'Retention heatmaps',
    clubs_card2_title: 'Club spaces',
    clubs_card2_body: 'Dedicated websites for clubs with calendars, galleries, and resident posts.',
    clubs_card2_item1: 'Multi-admin control',
    clubs_card2_item2: 'Theme presets',
    clubs_card2_item3: 'Quick publishing',
    clubs_card3_title: 'Shared growth',
    clubs_card3_body: 'See which constellations and stories grow from each club cohort.',
    clubs_card3_item1: 'Story attribution',
    clubs_card3_item2: 'Club connections',
    clubs_card3_item3: 'Growth cohorts',
    clubs_highlights_title: 'Club highlights',
    clubs_highlights_body: 'Featured clubs to start exploring.',
    clubs_loading: 'Loading...',
    map_title: 'Europe club map',
    map_desc: 'See where the community meets across Europe.',
    map_aria: 'OpenStreetMap of Europe',
    map_pin_open: 'Open {name}',
    websites_title: 'Websites',
    websites_desc: 'Launch branded sites with profiles, club hubs, and public stories.',
    websites_card1_title: 'Pages that feel alive',
    websites_card1_body: 'Highlight schedules, teams, and constellations in a single flow.',
    websites_card1_item1: 'Adaptive templates',
    websites_card1_item2: 'Multi-language copy',
    websites_card1_item3: 'Search-friendly copy',
    websites_card2_title: 'Visibility',
    websites_card2_body: 'Showcase clubs and keep stories discoverable.',
    websites_card2_item1: 'Shared calendars',
    websites_card2_item2: 'Story archives',
    websites_card2_item3: 'Community highlights',
    websites_card3_title: 'Stewardship',
    websites_card3_body: 'Keep approvals and publishing aligned across teams.',
    websites_card3_item1: 'Editorial flows',
    websites_card3_item2: 'Member roles',
    websites_card3_item3: 'Edit history',
    website_visit: 'Visit website',
    blog_title: 'Blog posts',
    blog_desc: 'Storytelling tied to users, constellations, and travel memories.',
    blog_loading: 'Loading posts from legacy archive...',
    moderation_title: 'Review queue',
    moderation_desc: 'New profiles, comments, and blog posts wait for review before going live.',
    moderation_pending_label: 'Pending reviews',
    moderation_pending_desc: 'Approve or reject reviews before they appear publicly.',
    moderation_queue_label: 'Queue',
    moderation_queue_empty: 'No reviews in the queue.',
    moderation_admin_only_title: 'Admins only',
    moderation_admin_only_desc: 'Sign in with an admin account to review submissions.',
    moderation_open_admin: 'Open admin panel',
    admin_title: 'Admin panel',
    admin_subtitle: 'Moderate reviews, keep profiles safe, and publish with confidence.',
    admin_access_denied_title: 'Access denied',
    admin_access_denied_body: 'You need an admin account to access this panel.',
    admin_back_home: 'Back to home',
    admin_pending_title: 'Pending reviews',
    admin_pending_desc: 'Reviews waiting for approval or rejection.',
    admin_approved_title: 'Approved reviews',
    admin_approved_desc: 'Recently published reviews from the community.',
    admin_queue_title: 'Moderation queue',
    admin_action_approve: 'Approve',
    admin_action_reject: 'Reject',
    admin_no_pending: 'No pending reviews.',
    admin_recent_title: 'Recently approved',
    admin_recent_empty: 'No approved reviews yet.',
    admin_events_title: 'Event moderation',
    admin_events_desc: 'Review pending RSVPs across all events.',
    admin_events_empty: 'No pending event RSVPs.',
    clubs_page_title: 'Clubs',
    clubs_page_desc:
      'Browse every club, then open a detail page for reviews and stories.',
    club_submit_title: 'Submit a club',
    club_submit_desc: 'Know a club we should add? Send the details for review.',
    club_submit_name_label: 'Club name',
    club_submit_city_label: 'City',
    club_submit_country_label: 'Country',
    club_submit_website_label: 'Website',
    club_submit_summary_label: 'Short description',
    club_submit_summary_placeholder: 'Share what makes this club special...',
    club_submit_submit: 'Submit club',
    club_submit_submitting: 'Submitting...',
    club_submit_signin_required: 'Sign in to submit a club.',
    club_submit_status_pending: 'Club submitted for moderation.',
    club_submit_status_error: 'Unable to submit club. Please try again.',
    club_submit_permission_error:
      'Club submission blocked by Firestore rules. Check permissions.',
    city_breadcrumb_home: 'Home',
    city_breadcrumb_clubs: 'Clubs',
    city_title_desc: 'Clubs and constellations connected to this city.',
    city_fallback: 'This city',
    city_clubs_title: 'Clubs',
    city_constellations_title: 'Constellations',
    city_clubs_empty: 'No clubs listed yet.',
    city_constellations_empty: 'No constellations listed yet.',
    club_not_found_title: 'Club not found',
    club_not_found_body: 'We could not find that club.',
    club_back: 'Back to clubs',
    club_description: 'Description',
    club_info: 'Useful information',
    club_city: 'City',
    club_country: 'Country',
    club_date_visited: 'Date visited',
    club_dress_code: 'Dress code',
    club_party_type: 'Party type',
    club_day_of_week: 'Day of week',
    club_website: 'Website',
    club_visit_site: 'Visit site',
    reviews_title: 'Reviews',
    reviews_desc: 'Full reviews and community notes.',
    reviews_club_title: 'Club reviews',
    reviews_club_desc: 'Reviews for this club are shown here after moderation.',
    reviews_none: 'No reviews published yet.',
    review_rating_label: 'Rating',
    review_text_label: 'Review',
    review_text_placeholder: 'Share your experience with this club...',
    review_submit: 'Submit for review',
    review_submitting: 'Submitting...',
    review_signin_required: 'Sign in to submit a review.',
    review_status_pending: 'Review submitted for moderation.',
    review_status_error: 'Unable to submit review. Please try again.',
    review_permission_error: 'Review blocked by Firestore rules. Check permissions.',
    review_author_anonymous: 'anonymous',
    review_rating_status: 'Rating: {rating}/5 · Status: {status}',
    review_identity_label: 'Post as',
    review_identity_profile: 'Your profile',
    review_identity_anonymous: 'Anonymous',
    status_pending: 'Pending',
    status_approved: 'Approved',
    status_rejected: 'Rejected',
    status_published: 'Published',
    rating_option_5: '5 - Stellar',
    rating_option_4: '4 - Bright',
    rating_option_3: '3 - Solid',
    rating_option_2: '2 - Needs work',
    rating_option_1: '1 - Poor',
    map_page_title: 'Swingers map of europe',
    map_page_desc: 'Debug view focused on the Europe club map.',
  },
  pl: {
    site_tagline: 'Nowoczesne społeczności mapowane jak konstelacje.',
    nav_users: 'Użytkownicy',
    nav_constellations: 'Konstelacje',
    nav_clubs: 'Kluby',
    nav_events: 'Wydarzenia',
    nav_map: 'Mapa',
    nav_websites: 'Strony',
    nav_blog: 'Blog',
    nav_join: 'Dołącz',
    nav_review: 'Recenzje',
    nav_admin: 'Admin',
    user_menu_label: 'Konto',
    user_menu_edit: 'Edytuj profil',
    user_menu_host: 'Panel gospodarza',
    user_menu_signout: 'Wyloguj się',
    profile_page_title: 'Twój profil',
    profile_page_subtitle: 'Zaktualizuj dane i ustawienia prywatności.',
    profile_save: 'Zapisz zmiany',
    profile_saving: 'Zapisywanie...',
    profile_saved: 'Profil zaktualizowany.',
    profile_save_error: 'Nie udało się zaktualizować profilu.',
    profile_signin_prompt: 'Zaloguj się, aby edytować profil.',
    request_access: 'Poproś o dostęp',
    link_section_title: 'Połączenia konstelacji',
    link_section_subtitle:
      'Wysyłaj prośby, potwierdzaj zgodę i wybieraj widoczność.',
    link_request_email_label: 'Prośba e-mail',
    link_request_email_placeholder: 'partner@email.com',
    link_request_type_label: 'Typ relacji',
    link_request_send: 'Wyślij prośbę',
    link_request_sending: 'Wysyłanie...',
    link_request_status_sent: 'Prośba wysłana.',
    link_request_status_missing: 'Podaj e-mail, aby wysłać prośbę.',
    link_request_status_self: 'Nie możesz połączyć się z własnym e-mailem.',
    link_request_status_not_found: 'Nie znaleziono użytkownika.',
    link_request_status_exists: 'Prośba już istnieje.',
    link_request_status_error: 'Nie udało się wysłać prośby.',
    link_requests_incoming_title: 'Przychodzące prośby',
    link_requests_outgoing_title: 'Wysłane prośby',
    link_requests_confirmed_title: 'Potwierdzone połączenia',
    link_requests_empty: 'Brak.',
    link_request_accept: 'Akceptuj',
    link_request_decline: 'Odrzuć',
    link_request_merge_label: 'Połącz widoczność w wyszukiwaniu',
    link_request_merge_on: 'Połączone',
    link_request_merge_off: 'Niezależne',
    photo_upload_label: 'Zdjęcie profilu',
    photo_upload_button: 'Wyślij',
    photo_upload_success: 'Zdjęcie zaktualizowane.',
    photo_upload_error: 'Nie udało się wysłać zdjęcia.',
    notifications_title: 'Powiadomienia',
    notifications_desc: 'Wlacz powiadomienia o zaproszeniach i zmianach.',
    notifications_enable: 'Wlacz powiadomienia',
    notifications_disable: 'Wylacz powiadomienia',
    notifications_enabled: 'Powiadomienia wlaczone.',
    notifications_disabled: 'Powiadomienia wylaczone.',
    notifications_blocked: 'Powiadomienia sa zablokowane w przegladarce.',
    notifications_missing_key: 'Brak klucza VAPID dla powiadomien.',
    notifications_error: 'Nie udalo sie zaktualizowac powiadomien.',
    verification_title: 'Weryfikacja foto',
    verification_desc: 'Wyslij selfie z haslem weryfikacyjnym.',
    verification_phrase_label: 'Haslo weryfikacyjne',
    verification_phrase: 'LBS2025',
    verification_upload_label: 'Zdjecie weryfikacyjne',
    verification_submit: 'Wyslij weryfikacje',
    verification_submitting: 'Wysylanie...',
    verification_status_pending: 'Weryfikacja wyslana do sprawdzenia.',
    verification_status_success: 'Weryfikacja zaktualizowana.',
    verification_status_error: 'Nie udalo sie wyslac weryfikacji.',
    verification_admin_title: 'Weryfikacje foto',
    verification_admin_desc: 'Sprawdz selfie weryfikacyjne.',
    verification_admin_empty: 'Brak wnioskow.',
    verification_admin_approve: 'Akceptuj',
    verification_admin_reject: 'Odrzuc',
    events_page_title: 'Imprezy i wydarzenia',
    events_page_desc: 'Zobacz nadchodzące wydarzenia, limity i status weryfikacji.',
    event_privacy_label: 'Prywatność',
    event_privacy_public: 'Publiczne',
    event_privacy_vetted: 'Weryfikowane',
    event_privacy_private: 'Prywatne',
    event_privacy_notice_public: 'Widoczne dla wszystkich. Adres dostępny.',
    event_privacy_notice_vetted: 'Widoczne dla wszystkich. Adres po akceptacji.',
    event_privacy_notice_private: 'Tylko zaproszeni. Ukryte na liście.',
    event_address_label: 'Lokalizacja',
    event_address_hidden: 'Adres ukryty do akceptacji.',
    event_cap_label: 'Limit gości',
    event_cap_men: 'Mężczyźni',
    event_cap_women: 'Kobiety',
    event_cap_couples: 'Pary',
    event_rsvp_title: 'RSVP',
    event_rsvp_desc: 'Wybierz kategorię, aby poprosić o miejsce.',
    event_rsvp_category_label: 'Kategoria',
    event_rsvp_submit: 'Wyślij RSVP',
    event_rsvp_sending: 'Wysyłanie...',
    event_rsvp_full: 'Brak miejsc w tej kategorii.',
    event_rsvp_pending: 'RSVP oczekuje na akceptację.',
    event_rsvp_approved: 'RSVP zaakceptowane.',
    event_rsvp_declined: 'RSVP odrzucone.',
    event_rsvp_error: 'Nie udało się wysłać RSVP.',
    event_rsvp_signed_out: 'Zaloguj się, aby wysłać RSVP.',
    event_rsvp_qr_title: 'Kod wejścia',
    event_rsvp_qr_desc: 'Pokaż kod przy wejściu.',
    event_guest_manager_title: 'Panel gości',
    event_guest_manager_desc: 'Weryfikuj RSVP i odznaki zaufania.',
    event_guest_manager_pending: 'Oczekujące prośby',
    event_guest_manager_approved: 'Zaakceptowani goście',
    event_guest_manager_empty: 'Brak RSVP.',
    event_guest_action_approve: 'Akceptuj',
    event_guest_action_decline: 'Odrzuć',
    event_not_found_title: 'Nie znaleziono wydarzenia',
    event_not_found_body: 'Nie znaleźliśmy tego wydarzenia.',
    event_back: 'Wróć do wydarzeń',
    event_live_status_label: 'Status na żywo',
    event_live_status_open: 'Otwarta',
    event_live_status_full: 'Pelna',
    event_live_status_last_call: 'Ostatnie wejscie',
    event_live_update: 'Zmien status',
    event_live_chat_title: 'Czat na żywo',
    event_live_chat_placeholder: 'Napisz wiadomość...',
    event_live_chat_send: 'Wyślij',
    host_dashboard_title: 'Panel gospodarza',
    host_dashboard_desc: 'Przegląd RSVP dla Twoich wydarzeń.',
    host_dashboard_empty: 'Brak wydarzeń gospodarza.',
    host_dashboard_signin: 'Zaloguj się, aby zobaczyć narzędzia hosta.',
    footer_tagline: 'Dom społeczności dla użytkowników, konstelacji, klubów i historii.',
    footer_guidelines: 'Wytyczne i regulamin',
    lang_select_label: 'Wybierz język',
    hero_pill: 'Dla twórców, klubów i wspólnych historii',
    hero_title: 'Twórz żywą sieć ludzi, klubów i niezapomnianych nocy.',
    hero_lead:
      'LedBySwing łączy ludzi, konstelacje i kluby, dając miejsce na historie, recenzje i dzienniki podróży.',
    hero_paragraph:
      'Welcome to the next evolution of ethical non-monogamy. LedBySwing is a community-built platform designed for the way we actually live. Whether you are a solo explorer, part of an established couple, or a member of a complex constellation, we provide the tools to connect, organize, and thrive. No paywalls, no hidden fees—just an open, adult space dedicated to authentic connection and unforgettable events.',
    relationships_title: 'Your Relationships Are Unique. Your Platform Should Be Too.',
    relationships_body:
      'Traditional sites stop at "Single" or "Couple." We go further. From managing intricate polycules to hosting private events, LedBySwing is designed to handle the beautiful complexity of modern ethical non-monogamy. Bring your constellation home.',
    hero_cta_primary: 'Uruchom konstelację',
    hero_cta_secondary: 'Poznaj sieć',
    metric_label: 'Aktywni użytkownicy',
    metric_caption: 'Wzrost w 12 regionach',
    register_page_title: 'Załóż konto',
    register_page_subtitle:
      'To tworzy konto dla jednej osoby. Pary i konstelacje dodasz później.',
    auth_title: 'Załóż konto',
    auth_subtitle:
      'Profile odblokowują recenzje, prywatne kalendarze wydarzeń i zaproszenia od konstelacji.',
    register_kicker: 'Prywatny dostęp społeczności',
    register_heading: 'Zbuduj profil z intencją.',
    register_body:
      'Każde konto jest weryfikowane. Możesz przeglądać anonimowo, ale recenzje i zaproszenia wymagają profilu.',
    label_display_name: 'Nazwa wyświetlana',
    label_email: 'Email',
    label_password: 'Hasło',
    label_confirm_password: 'Potwierdź hasło',
    label_birth_date: 'Data urodzenia',
    label_location: 'Lokalizacja',
    label_location_lat: 'Szerokosc geograficzna',
    label_location_lng: 'Dlugosc geograficzna',
    label_interests: 'Zainteresowania',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ znaków',
    placeholder_confirm_password: 'Wpisz ponownie hasło',
    placeholder_birth_date: 'RRRR-MM-DD',
    placeholder_location: 'Miasto, kraj',
    placeholder_location_lat: '51.10',
    placeholder_location_lng: '17.03',
    placeholder_interests: 'Relacje otwarte, Voyeur, BDSM',
    interest_tag_1: 'Relacje otwarte',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Wydarzenia społeczne',
    consent_age: 'I confirm I am 18+ (or the legal age of majority in my jurisdiction).',
    consent_privacy: 'Zachowaj mój profil prywatny do czasu publikacji.',
    consent_policy_prefix: 'I have read and agree to the ',
    consent_policy_link: 'Terms of Service and Community Guidelines',
    consent_policy_suffix: '.',
    register_create: 'Utwórz konto',
    register_creating: 'Tworzenie konta...',
    register_google_cta: 'Utwórz konto przez Google',
    register_google_hint: 'Użyj Google, aby pominąć hasło. Wypełnimy e-mail za Ciebie.',
    auth_sign_in_google: 'Zaloguj przez Google',
    auth_sign_out: 'Wyloguj',
    auth_status_setup: 'Wymagana konfiguracja logowania',
    auth_status_config: 'Wymagana konfiguracja logowania',
    auth_status_pending: 'Nowe konta są weryfikowane przed publikacją',
    auth_sign_in_missing: 'Enter your email and password to sign in.',
    auth_sign_in_success: 'Signed in.',
    auth_sign_in_error: 'Unable to sign in. Please try again.',
    register_password_mismatch: 'Hasła nie są zgodne.',
    register_underage: 'Musisz mieć co najmniej 18 lat.',
    register_status_success: 'Konto utworzone. Oczekuje na weryfikację.',
    register_status_permission:
      'Konto utworzone, ale zapis profilu zablokowany przez reguły Firestore.',
    register_status_error: 'Nie udało się utworzyć konta. Spróbuj ponownie.',
    register_expect_label: 'Czego się spodziewać',
    register_expect_text: 'Przemyślane moderowanie i zweryfikowane profile.',
    register_privacy_label: 'Prywatność',
    register_privacy_text: 'Wybierz, co pokazujesz przed publikacją.',
    register_trust_label: 'Zaufanie',
    register_trust_text: 'Recenzje są powiązane z realnymi profilami.',
    register_have_account: 'Masz już konto?',
    register_sign_in: 'Zaloguj się',
    guidelines_page_title: 'Guidelines & Terms',
    guidelines_page_subtitle: 'Please read these policies before joining or hosting events.',
    terms_title: 'Terms of Service (The Legal Guardrails)',
    terms_eligibility_title: 'Eligibility & Age Verification',
    terms_eligibility_item_1:
      '18+ requirement: You must be at least 18 years old (or the legal age of majority in your jurisdiction) to access this site.',
    terms_eligibility_item_2:
      'Verification: We may require age assurance or ID matching to prevent underage access, especially before allowing participation in events.',
    terms_content_title: 'Content Ownership & License',
    terms_content_item_1: 'Your content: You retain ownership of the photos and text you upload.',
    terms_content_item_2:
      'Our license: By posting content, you grant us a non-exclusive, royalty-free license to host and display it for the purpose of operating the service.',
    terms_content_item_3:
      'Copyright (DMCA): We respect intellectual property. If you believe your work has been copied, use our designated takedown process.',
    terms_prohibited_title: 'Prohibited Content & Illegal Acts',
    terms_prohibited_item_1:
      'Zero tolerance: We strictly prohibit facilitation of sex trafficking (FOSTA-SESTA compliance) or any non-consensual sexual content.',
    terms_prohibited_item_2:
      'Illegal acts: Using the platform to promote illegal drugs, violence, or harm is grounds for immediate termination.',
    terms_liability_title: 'Limitation of Liability',
    terms_liability_item_1:
      'As-is service: LedBySwing is provided as-is without warranties of uptime or performance.',
    terms_liability_item_2:
      'Social interaction: We are not responsible for the behavior of users at offline events organized through the site.',
    guidelines_title: 'Community Guidelines (The Vibe & Ethics)',
    guidelines_core_title: 'The C.O.R.E. Principles',
    guidelines_core_item_1:
      'Consent: Verbal, active, and enthusiastic consent is mandatory for all interactions, both digital and physical.',
    guidelines_core_item_2:
      'Openness: We are an inclusive space. We welcome all genders, orientations, and relationship structures (monogamous-ish to complex polycules).',
    guidelines_core_item_3:
      'Respect: Treat others with dignity. Harassment, hunting, or aggressive behavior is not tolerated.',
    guidelines_core_item_4:
      'Ethics: We value transparency. Always be honest about your relationship status and the boundaries of your constellation.',
    guidelines_constellation_title: 'Constellation Etiquette',
    guidelines_constellation_item_1:
      'Linked profiles: When linking accounts into a constellation, ensure all parties have consented to being displayed together.',
    guidelines_constellation_item_2:
      "Privacy: Never share another member's real-world identity or private photos without explicit permission.",
    guidelines_event_title: 'Event Safety',
    guidelines_event_item_1:
      'Host rights: Event organizers have the right to set their own vetting requirements (e.g., ID checks or references) for private gatherings.',
    guidelines_event_item_2:
      'Reporting: If you witness unsafe behavior at an event or on the site, use our Flag tool. We prioritize reports involving non-consensual behavior.',
    users_title: 'Użytkownicy',
    users_subtitle: 'Profile, role i wspólna aktywność napędzają konstelacje.',
    users_card_profiles_title: 'Profile',
    users_card_profiles_body: 'Profile z rolami, zaimkami i zainteresowaniami.',
    users_card_profiles_item1: 'Niestandardowe tagi',
    users_card_profiles_item2: 'Status dostępności',
    users_card_profiles_item3: 'Wspólne zainteresowania',
    users_card_trust_title: 'Zaufanie społeczności',
    users_card_trust_body: 'Dynamika rośnie, gdy członkowie dzielą się historiami.',
    users_card_trust_item1: 'Polecenia społeczności',
    users_card_trust_item2: 'Obecność na wydarzeniach',
    users_card_trust_item3: 'Wpływ historii',
    users_card_privacy_title: 'Ustawienia prywatności',
    users_card_privacy_body: 'Wybierz widoczność w klubach i konstelacjach.',
    users_card_privacy_item1: 'Widoczność per klub',
    users_card_privacy_item2: 'Kontrola historii',
    users_card_privacy_item3: 'Maskowanie aktywności',
    const_title: 'Konstelacje',
    const_subtitle: 'Każda konstelacja to kuratorowany zestaw użytkowników.',
    const_card_title: 'Klastry współpracy',
    const_card_body:
      'Buduj konstelacje do mentorstwa, współtworzenia lub startów projektów.',
    const_tag1: 'Wymagane 2+ osoby',
    const_tag2: 'Wspólna misja',
    const_tag3: 'Ograniczone czasowo',
    clubs_title: 'Kluby',
    clubs_subtitle: 'Niezależne miejsca, które organizują wydarzenia i budują konstelacje.',
    clubs_card1_title: 'Ścieżki członkostwa',
    clubs_card1_body: 'Poziomy dostępu dla gości, członków i ambasadorów.',
    clubs_card1_item1: 'Wejścia na zaproszenie',
    clubs_card1_item2: 'Check-in na wydarzenia',
    clubs_card1_item3: 'Mapy retencji',
    clubs_card2_title: 'Przestrzenie klubów',
    clubs_card2_body: 'Strony klubowe z kalendarzami, galeriami i postami.',
    clubs_card2_item1: 'Wielu administratorów',
    clubs_card2_item2: 'Gotowe motywy',
    clubs_card2_item3: 'Szybka publikacja',
    clubs_card3_title: 'Wspólny wzrost',
    clubs_card3_body: 'Sprawdź, które historie rosną z klubów.',
    clubs_card3_item1: 'Atrybucja historii',
    clubs_card3_item2: 'Połączenia klubów',
    clubs_card3_item3: 'Kohorty wzrostu',
    clubs_highlights_title: 'Polecane kluby',
    clubs_highlights_body: 'Wybrane kluby na start.',
    clubs_loading: 'Ładowanie...',
    map_title: 'Mapa klubów Europy',
    map_desc: 'Zobacz, gdzie spotyka się społeczność.',
    map_aria: 'OpenStreetMap Europy',
    map_pin_open: 'Otwórz {name}',
    websites_title: 'Strony',
    websites_desc: 'Buduj marki z profilami, klubami i historiami.',
    websites_card1_title: 'Strony, które żyją',
    websites_card1_body: 'Wyróżnij kalendarze, zespoły i konstelacje.',
    websites_card1_item1: 'Elastyczne szablony',
    websites_card1_item2: 'Wiele języków',
    websites_card1_item3: 'SEO-friendly',
    websites_card2_title: 'Widoczność',
    websites_card2_body: 'Pokazuj kluby i utrzymuj odkrywalność historii.',
    websites_card2_item1: 'Wspólne kalendarze',
    websites_card2_item2: 'Archiwa historii',
    websites_card2_item3: 'Highlights społeczności',
    websites_card3_title: 'Opieka',
    websites_card3_body: 'Zachowaj spójność publikacji i akceptacji.',
    websites_card3_item1: 'Procesy redakcyjne',
    websites_card3_item2: 'Role członków',
    websites_card3_item3: 'Historia edycji',
    website_visit: 'Odwiedź stronę',
    blog_title: 'Wpisy na blogu',
    blog_desc: 'Opowieści powiązane z użytkownikami i podróżami.',
    blog_loading: 'Ładowanie archiwum...',
    moderation_title: 'Kolejka recenzji',
    moderation_desc: 'Nowe profile i komentarze czekają na weryfikację.',
    moderation_pending_label: 'Oczekujące recenzje',
    moderation_pending_desc: 'Zatwierdź lub odrzuć przed publikacją.',
    moderation_queue_label: 'Kolejka',
    moderation_queue_empty: 'Brak recenzji w kolejce.',
    moderation_admin_only_title: 'Tylko admin',
    moderation_admin_only_desc: 'Zaloguj się jako admin, aby moderować.',
    moderation_open_admin: 'Otwórz panel admina',
    admin_title: 'Panel administracyjny',
    admin_subtitle: 'Moderuj recenzje i publikuj z pewnością.',
    admin_access_denied_title: 'Brak dostępu',
    admin_access_denied_body: 'Potrzebujesz konta admina.',
    admin_back_home: 'Powrót do strony głównej',
    admin_pending_title: 'Oczekujące recenzje',
    admin_pending_desc: 'Recenzje czekające na decyzję.',
    admin_approved_title: 'Zatwierdzone recenzje',
    admin_approved_desc: 'Najnowsze opublikowane recenzje.',
    admin_queue_title: 'Kolejka moderacji',
    admin_action_approve: 'Zatwierdź',
    admin_action_reject: 'Odrzuć',
    admin_no_pending: 'Brak oczekujących recenzji.',
    admin_recent_title: 'Ostatnio zatwierdzone',
    admin_recent_empty: 'Brak zatwierdzonych recenzji.',
    admin_events_title: 'Moderacja wydarzeń',
    admin_events_desc: 'Przeglądaj oczekujące RSVP dla wszystkich wydarzeń.',
    admin_events_empty: 'Brak oczekujących RSVP do wydarzeń.',
    clubs_page_title: 'Kluby',
    clubs_page_desc: 'Przeglądaj kluby i otwieraj szczegóły.',
    club_submit_title: 'Zgłoś klub',
    club_submit_desc:
      'Znasz klub, który powinniśmy dodać? Prześlij szczegóły do weryfikacji.',
    club_submit_name_label: 'Nazwa klubu',
    club_submit_city_label: 'Miasto',
    club_submit_country_label: 'Kraj',
    club_submit_website_label: 'Strona',
    club_submit_summary_label: 'Krótki opis',
    club_submit_summary_placeholder: 'Opisz, co wyróżnia ten klub...',
    club_submit_submit: 'Wyślij klub',
    club_submit_submitting: 'Wysyłanie...',
    club_submit_signin_required: 'Zaloguj się, aby zgłosić klub.',
    club_submit_status_pending: 'Klub wysłany do moderacji.',
    club_submit_status_error: 'Nie udało się wysłać klubu.',
    club_submit_permission_error:
      'Zgłoszenie klubu zablokowane przez reguły Firestore.',
    city_breadcrumb_home: 'Home',
    city_breadcrumb_clubs: 'Kluby',
    city_title_desc: 'Kluby i konstelacje w tym mieście.',
    city_fallback: 'To miasto',
    city_clubs_title: 'Kluby',
    city_constellations_title: 'Konstelacje',
    city_clubs_empty: 'Brak klubów.',
    city_constellations_empty: 'Brak konstelacji.',
    club_not_found_title: 'Nie znaleziono klubu',
    club_not_found_body: 'Nie znaleziono tego klubu.',
    club_back: 'Powrót do klubów',
    club_description: 'Opis',
    club_info: 'Informacje',
    club_city: 'Miasto',
    club_country: 'Kraj',
    club_date_visited: 'Data wizyty',
    club_dress_code: 'Dress code',
    club_party_type: 'Typ imprezy',
    club_day_of_week: 'Dzień tygodnia',
    club_website: 'Strona',
    club_visit_site: 'Odwiedź',
    reviews_title: 'Recenzje',
    reviews_desc: 'Pełne recenzje i notatki społeczności.',
    reviews_club_title: 'Recenzje klubu',
    reviews_club_desc: 'Recenzje pojawią się po moderacji.',
    reviews_none: 'Brak opublikowanych recenzji.',
    review_rating_label: 'Ocena',
    review_text_label: 'Recenzja',
    review_text_placeholder: 'Podziel się doświadczeniem z tym klubem...',
    review_submit: 'Wyślij do recenzji',
    review_submitting: 'Wysyłanie...',
    review_signin_required: 'Zaloguj się, aby dodać recenzję.',
    review_status_pending: 'Recenzja wysłana do moderacji.',
    review_status_error: 'Nie udało się wysłać recenzji.',
    review_permission_error: 'Recenzja zablokowana przez reguły Firestore.',
    review_author_anonymous: 'anonim',
    review_rating_status: 'Ocena: {rating}/5 · Status: {status}',
    review_identity_label: 'Opublikuj jako',
    review_identity_profile: 'Twój profil',
    review_identity_anonymous: 'Anonim',
    status_pending: 'Oczekuje',
    status_approved: 'Zatwierdzona',
    status_rejected: 'Odrzucona',
    status_published: 'Opublikowana',
    rating_option_5: '5 - Rewelacja',
    rating_option_4: '4 - Bardzo dobrze',
    rating_option_3: '3 - Solidnie',
    rating_option_2: '2 - Do poprawy',
    rating_option_1: '1 - Słabo',
    map_page_title: 'Mapa klubów w Europie',
    map_page_desc: 'Widok debugowania mapy klubów.',
  },
  fr: {
    site_tagline: 'Des communautés modernes cartographiées comme des constellations.',
    nav_users: 'Utilisateurs',
    nav_constellations: 'Constellations',
    nav_clubs: 'Clubs',
    nav_events: 'Événements',
    nav_map: 'Carte',
    nav_websites: 'Sites',
    nav_blog: 'Blog',
    nav_join: 'Rejoindre',
    nav_review: 'Avis',
    nav_admin: 'Admin',
    user_menu_label: 'Compte',
    user_menu_edit: 'Modifier le profil',
    user_menu_host: 'Tableau hôte',
    user_menu_signout: 'Se déconnecter',
    profile_page_title: 'Votre profil',
    profile_page_subtitle: 'Mettez à jour vos informations et votre confidentialité.',
    profile_save: 'Enregistrer',
    profile_saving: 'Enregistrement...',
    profile_saved: 'Profil mis à jour.',
    profile_save_error: "Impossible de mettre à jour le profil.",
    profile_signin_prompt: 'Connectez-vous pour modifier votre profil.',
    request_access: "Demander l'accès",
    link_section_title: 'Liens de constellation',
    link_section_subtitle:
      'Envoyez des demandes, confirmez le consentement et choisissez la visibilité.',
    link_request_email_label: 'Demande par e-mail',
    link_request_email_placeholder: 'partner@email.com',
    link_request_type_label: 'Type de lien',
    link_request_send: 'Envoyer la demande',
    link_request_sending: 'Envoi...',
    link_request_status_sent: 'Demande envoyée.',
    link_request_status_missing: 'Saisissez un e-mail pour envoyer une demande.',
    link_request_status_self: 'Impossible de vous lier à votre propre e-mail.',
    link_request_status_not_found: 'Aucun utilisateur trouvé.',
    link_request_status_exists: 'Une demande existe déjà.',
    link_request_status_error: "Impossible d'envoyer la demande.",
    link_requests_incoming_title: 'Demandes entrantes',
    link_requests_outgoing_title: 'Demandes sortantes',
    link_requests_confirmed_title: 'Liens confirmés',
    link_requests_empty: 'Aucun.',
    link_request_accept: 'Accepter',
    link_request_decline: 'Refuser',
    link_request_merge_label: 'Fusionner la visibilité',
    link_request_merge_on: 'Fusionné',
    link_request_merge_off: 'Indépendant',
    photo_upload_label: 'Photo de profil',
    photo_upload_button: 'Envoyer',
    photo_upload_success: 'Photo mise à jour.',
    photo_upload_error: 'Impossible d’envoyer la photo.',
    notifications_title: 'Notifications',
    notifications_desc: 'Activez les notifications pour les invitations.',
    notifications_enable: 'Activer les notifications',
    notifications_disable: 'Desactiver les notifications',
    notifications_enabled: 'Notifications activees.',
    notifications_disabled: 'Notifications desactivees.',
    notifications_blocked: 'Notifications bloquees dans le navigateur.',
    notifications_missing_key: 'Cle VAPID manquante.',
    notifications_error: 'Impossible de mettre a jour les notifications.',
    verification_title: 'Verification photo',
    verification_desc: 'Envoyez un selfie avec la phrase de verification.',
    verification_phrase_label: 'Phrase de verification',
    verification_phrase: 'LBS2025',
    verification_upload_label: 'Photo de verification',
    verification_submit: 'Envoyer la verification',
    verification_submitting: 'Envoi...',
    verification_status_pending: 'Verification envoyee pour examen.',
    verification_status_success: 'Verification mise a jour.',
    verification_status_error: 'Impossible d’envoyer la verification.',
    verification_admin_title: 'Verification photo',
    verification_admin_desc: 'Examinez les selfies de verification.',
    verification_admin_empty: 'Aucune demande.',
    verification_admin_approve: 'Approuver',
    verification_admin_reject: 'Rejeter',
    events_page_title: 'Soirées & événements',
    events_page_desc: 'Événements à venir, quotas et validation des hôtes.',
    event_privacy_label: 'Niveau de confidentialité',
    event_privacy_public: 'Public',
    event_privacy_vetted: 'Vérifié',
    event_privacy_private: 'Privé',
    event_privacy_notice_public: 'Visible pour tous. Adresse partagée.',
    event_privacy_notice_vetted:
      'Visible pour tous. Adresse après validation.',
    event_privacy_notice_private: 'Sur invitation. Masqué publiquement.',
    event_address_label: 'Lieu',
    event_address_hidden: 'Adresse masquée jusqu’à validation.',
    event_cap_label: 'Capacité',
    event_cap_men: 'Hommes',
    event_cap_women: 'Femmes',
    event_cap_couples: 'Couples',
    event_rsvp_title: 'RSVP',
    event_rsvp_desc: 'Choisissez une catégorie pour demander une place.',
    event_rsvp_category_label: 'Catégorie',
    event_rsvp_submit: 'Envoyer RSVP',
    event_rsvp_sending: 'Envoi...',
    event_rsvp_full: 'Catégorie complète.',
    event_rsvp_pending: 'RSVP en attente.',
    event_rsvp_approved: 'RSVP accepté.',
    event_rsvp_declined: 'RSVP refusé.',
    event_rsvp_error: 'Impossible d’envoyer RSVP.',
    event_rsvp_signed_out: 'Connectez-vous pour RSVP.',
    event_rsvp_qr_title: 'QR d’entrée',
    event_rsvp_qr_desc: 'Présentez ce code à l’entrée.',
    event_guest_manager_title: 'Gestion des invités',
    event_guest_manager_desc: 'Examinez les RSVPs et badges.',
    event_guest_manager_pending: 'Demandes en attente',
    event_guest_manager_approved: 'Invités approuvés',
    event_guest_manager_empty: 'Aucun RSVP.',
    event_guest_action_approve: 'Approuver',
    event_guest_action_decline: 'Refuser',
    event_not_found_title: 'Événement introuvable',
    event_not_found_body: 'Impossible de trouver cet événement.',
    event_back: 'Retour aux événements',
    event_live_status_label: 'Statut en direct',
    event_live_status_open: 'Ouvert',
    event_live_status_full: 'Complet',
    event_live_status_last_call: 'Dernier appel',
    event_live_update: 'Mettre à jour',
    event_live_chat_title: 'Chat en direct',
    event_live_chat_placeholder: 'Ecrivez un message...',
    event_live_chat_send: 'Envoyer',
    host_dashboard_title: 'Tableau hôte',
    host_dashboard_desc: 'Suivez les RSVPs de vos événements.',
    host_dashboard_empty: 'Aucun événement en tant qu’hôte.',
    host_dashboard_signin: 'Connectez-vous pour les outils hôte.',
    footer_tagline: 'Maison de la communauté pour utilisateurs, constellations, clubs et histoires.',
    footer_guidelines: 'Consignes et conditions',
    lang_select_label: 'Choisir la langue',
    hero_pill: 'Pour les créateurs, les clubs et les histoires partagées',
    hero_title: 'Façonnez un réseau vivant de personnes, de clubs et de nuits inoubliables.',
    hero_lead:
      'LedBySwing réunit personnes, constellations et clubs pour partager histoires, avis et carnets de voyage.',
    hero_paragraph:
      'Welcome to the next evolution of ethical non-monogamy. LedBySwing is a community-built platform designed for the way we actually live. Whether you are a solo explorer, part of an established couple, or a member of a complex constellation, we provide the tools to connect, organize, and thrive. No paywalls, no hidden fees—just an open, adult space dedicated to authentic connection and unforgettable events.',
    relationships_title: 'Your Relationships Are Unique. Your Platform Should Be Too.',
    relationships_body:
      'Traditional sites stop at "Single" or "Couple." We go further. From managing intricate polycules to hosting private events, LedBySwing is designed to handle the beautiful complexity of modern ethical non-monogamy. Bring your constellation home.',
    hero_cta_primary: 'Lancer une constellation',
    hero_cta_secondary: 'Explorer le graphe',
    metric_label: 'Utilisateurs actifs',
    metric_caption: 'En croissance dans 12 régions',
    register_page_title: 'Créer votre compte',
    register_page_subtitle:
      'Ceci crée un compte pour une seule personne. Les couples ou constellations pourront être ajoutés plus tard.',
    auth_title: 'Créer votre compte',
    auth_subtitle:
      'Les profils débloquent les avis, les calendriers privés et les invitations.',
    register_kicker: 'Accès communautaire privé',
    register_heading: 'Construisez un profil intentionnel.',
    register_body:
      'Chaque compte est vérifié. Vous pouvez naviguer anonymement, mais les avis exigent un profil.',
    label_display_name: 'Nom affiché',
    label_email: 'Email',
    label_password: 'Mot de passe',
    label_confirm_password: 'Confirmer le mot de passe',
    label_birth_date: 'Date de naissance',
    label_location: 'Localisation',
    label_location_lat: 'Latitude',
    label_location_lng: 'Longitude',
    label_interests: 'Intérêts',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ caractères',
    placeholder_confirm_password: 'Ressaisir le mot de passe',
    placeholder_birth_date: 'AAAA-MM-JJ',
    placeholder_location: 'Ville, pays',
    placeholder_location_lat: '48.85',
    placeholder_location_lng: '2.35',
    placeholder_interests: 'Relations ouvertes, Voyeur, BDSM',
    interest_tag_1: 'Relations ouvertes',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Événements sociaux',
    consent_age: 'I confirm I am 18+ (or the legal age of majority in my jurisdiction).',
    consent_privacy: 'Garder mon profil privé jusqu’à publication.',
    consent_policy_prefix: 'I have read and agree to the ',
    consent_policy_link: 'Terms of Service and Community Guidelines',
    consent_policy_suffix: '.',
    register_create: 'Créer un compte',
    register_creating: 'Création...',
    register_google_cta: 'Créer un compte avec Google',
    register_google_hint:
      "Utilisez Google pour éviter le mot de passe. Nous préremplirons l'email.",
    auth_sign_in_google: 'Se connecter avec Google',
    auth_sign_out: 'Se déconnecter',
    auth_status_setup: 'Configuration requise',
    auth_status_config: 'Configuration requise',
    auth_status_pending: 'Les nouveaux comptes sont vérifiés avant publication',
    auth_sign_in_missing: 'Enter your email and password to sign in.',
    auth_sign_in_success: 'Signed in.',
    auth_sign_in_error: 'Unable to sign in. Please try again.',
    register_password_mismatch: 'Les mots de passe ne correspondent pas.',
    register_underage: 'Vous devez avoir au moins 18 ans.',
    register_status_success: 'Compte créé. En attente de validation.',
    register_status_permission:
      'Compte créé, mais stockage bloqué par les règles Firestore.',
    register_status_error: 'Impossible de créer le compte. Réessayez.',
    register_expect_label: 'À prévoir',
    register_expect_text: 'Modération attentive et profils vérifiés.',
    register_privacy_label: 'Confidentialité',
    register_privacy_text: 'Choisissez ce que vous montrez avant publication.',
    register_trust_label: 'Confiance',
    register_trust_text: 'Les avis sont liés à de vrais profils.',
    register_have_account: 'Vous avez déjà un compte ?',
    register_sign_in: 'Se connecter',
    guidelines_page_title: 'Guidelines & Terms',
    guidelines_page_subtitle: 'Please read these policies before joining or hosting events.',
    terms_title: 'Terms of Service (The Legal Guardrails)',
    terms_eligibility_title: 'Eligibility & Age Verification',
    terms_eligibility_item_1:
      '18+ requirement: You must be at least 18 years old (or the legal age of majority in your jurisdiction) to access this site.',
    terms_eligibility_item_2:
      'Verification: We may require age assurance or ID matching to prevent underage access, especially before allowing participation in events.',
    terms_content_title: 'Content Ownership & License',
    terms_content_item_1: 'Your content: You retain ownership of the photos and text you upload.',
    terms_content_item_2:
      'Our license: By posting content, you grant us a non-exclusive, royalty-free license to host and display it for the purpose of operating the service.',
    terms_content_item_3:
      'Copyright (DMCA): We respect intellectual property. If you believe your work has been copied, use our designated takedown process.',
    terms_prohibited_title: 'Prohibited Content & Illegal Acts',
    terms_prohibited_item_1:
      'Zero tolerance: We strictly prohibit facilitation of sex trafficking (FOSTA-SESTA compliance) or any non-consensual sexual content.',
    terms_prohibited_item_2:
      'Illegal acts: Using the platform to promote illegal drugs, violence, or harm is grounds for immediate termination.',
    terms_liability_title: 'Limitation of Liability',
    terms_liability_item_1:
      'As-is service: LedBySwing is provided as-is without warranties of uptime or performance.',
    terms_liability_item_2:
      'Social interaction: We are not responsible for the behavior of users at offline events organized through the site.',
    guidelines_title: 'Community Guidelines (The Vibe & Ethics)',
    guidelines_core_title: 'The C.O.R.E. Principles',
    guidelines_core_item_1:
      'Consent: Verbal, active, and enthusiastic consent is mandatory for all interactions, both digital and physical.',
    guidelines_core_item_2:
      'Openness: We are an inclusive space. We welcome all genders, orientations, and relationship structures (monogamous-ish to complex polycules).',
    guidelines_core_item_3:
      'Respect: Treat others with dignity. Harassment, hunting, or aggressive behavior is not tolerated.',
    guidelines_core_item_4:
      'Ethics: We value transparency. Always be honest about your relationship status and the boundaries of your constellation.',
    guidelines_constellation_title: 'Constellation Etiquette',
    guidelines_constellation_item_1:
      'Linked profiles: When linking accounts into a constellation, ensure all parties have consented to being displayed together.',
    guidelines_constellation_item_2:
      "Privacy: Never share another member's real-world identity or private photos without explicit permission.",
    guidelines_event_title: 'Event Safety',
    guidelines_event_item_1:
      'Host rights: Event organizers have the right to set their own vetting requirements (e.g., ID checks or references) for private gatherings.',
    guidelines_event_item_2:
      'Reporting: If you witness unsafe behavior at an event or on the site, use our Flag tool. We prioritize reports involving non-consensual behavior.',
    users_title: 'Utilisateurs',
    users_subtitle: "Profils, rôles et activité partagée alimentent chaque constellation.",
    users_card_profiles_title: 'Profils',
    users_card_profiles_body: 'Profils avec rôles, pronoms et intérêts.',
    users_card_profiles_item1: 'Tags personnalisés',
    users_card_profiles_item2: 'Statut de disponibilité',
    users_card_profiles_item3: 'Intérêts partagés',
    users_card_trust_title: 'Confiance',
    users_card_trust_body: 'L’élan grandit quand la communauté partage.',
    users_card_trust_item1: 'Recommandations',
    users_card_trust_item2: 'Présence aux événements',
    users_card_trust_item3: 'Impact des histoires',
    users_card_privacy_title: 'Choix de confidentialité',
    users_card_privacy_body: 'Choisissez votre visibilité dans les clubs.',
    users_card_privacy_item1: 'Visibilité par club',
    users_card_privacy_item2: 'Contrôle des histoires',
    users_card_privacy_item3: 'Masquage d’activité',
    const_title: 'Constellations',
    const_subtitle: 'Chaque constellation regroupe deux utilisateurs ou plus.',
    const_card_title: 'Clusters collaboratifs',
    const_card_body:
      'Créez des constellations pour mentorat, co‑création ou lancement.',
    const_tag1: '2+ utilisateurs',
    const_tag2: 'Mission partagée',
    const_tag3: 'Durée limitée',
    clubs_title: 'Clubs',
    clubs_subtitle: 'Espaces indépendants qui organisent des événements et des histoires.',
    clubs_card1_title: 'Parcours membres',
    clubs_card1_body: 'Accès par niveaux pour invités, membres et ambassadeurs.',
    clubs_card1_item1: 'Entrées sur invitation',
    clubs_card1_item2: 'Check-in événements',
    clubs_card1_item3: 'Cartes de rétention',
    clubs_card2_title: 'Espaces club',
    clubs_card2_body: 'Sites dédiés avec calendriers, galeries et posts.',
    clubs_card2_item1: 'Multi‑admin',
    clubs_card2_item2: 'Thèmes prêts',
    clubs_card2_item3: 'Publication rapide',
    clubs_card3_title: 'Croissance partagée',
    clubs_card3_body: 'Voyez ce qui émerge de chaque cohorte.',
    clubs_card3_item1: 'Attribution des histoires',
    clubs_card3_item2: 'Connexions clubs',
    clubs_card3_item3: 'Cohortes de croissance',
    clubs_highlights_title: 'Clubs à la une',
    clubs_highlights_body: 'Clubs recommandés pour commencer.',
    clubs_loading: 'Chargement...',
    map_title: 'Carte des clubs en Europe',
    map_desc: 'Voir où la communauté se retrouve en Europe.',
    map_aria: "OpenStreetMap de l'Europe",
    map_pin_open: 'Ouvrir {name}',
    websites_title: 'Sites',
    websites_desc: 'Lancez des sites de marque avec profils et histoires.',
    websites_card1_title: 'Pages vivantes',
    websites_card1_body: 'Mettez en avant calendriers, équipes et constellations.',
    websites_card1_item1: 'Templates adaptatifs',
    websites_card1_item2: 'Copie multilingue',
    websites_card1_item3: 'Optimisé SEO',
    websites_card2_title: 'Visibilité',
    websites_card2_body: 'Exposez les clubs et les histoires.',
    websites_card2_item1: 'Calendriers partagés',
    websites_card2_item2: 'Archives',
    websites_card2_item3: 'Temps forts',
    websites_card3_title: 'Gouvernance',
    websites_card3_body: 'Gardez les validations alignées.',
    websites_card3_item1: 'Flux éditoriaux',
    websites_card3_item2: 'Rôles membres',
    websites_card3_item3: 'Historique',
    website_visit: 'Voir le site',
    blog_title: 'Articles de blog',
    blog_desc: 'Récits liés aux utilisateurs et aux voyages.',
    blog_loading: 'Chargement des archives...',
    moderation_title: 'File de validation',
    moderation_desc: 'Nouveaux profils et avis en attente de validation.',
    moderation_pending_label: 'Avis en attente',
    moderation_pending_desc: 'Approuvez ou refusez avant publication.',
    moderation_queue_label: 'File',
    moderation_queue_empty: "Aucun avis dans la file.",
    moderation_admin_only_title: 'Admins uniquement',
    moderation_admin_only_desc: 'Connectez-vous en admin pour modérer.',
    moderation_open_admin: 'Ouvrir le panneau admin',
    admin_title: 'Panneau admin',
    admin_subtitle: 'Modérez les avis et publiez en toute confiance.',
    admin_access_denied_title: 'Accès refusé',
    admin_access_denied_body: "Vous devez être admin pour accéder à ce panneau.",
    admin_back_home: "Retour à l'accueil",
    admin_pending_title: 'Avis en attente',
    admin_pending_desc: 'Avis en attente de décision.',
    admin_approved_title: 'Avis approuvés',
    admin_approved_desc: 'Avis publiés récemment.',
    admin_queue_title: 'File de modération',
    admin_action_approve: 'Approuver',
    admin_action_reject: 'Refuser',
    admin_no_pending: 'Aucun avis en attente.',
    admin_recent_title: 'Approuvés récemment',
    admin_recent_empty: 'Aucun avis approuvé.',
    admin_events_title: 'Modération des événements',
    admin_events_desc: 'Examinez les RSVPs en attente pour tous les événements.',
    admin_events_empty: "Aucun RSVP d'événement en attente.",
    clubs_page_title: 'Clubs',
    clubs_page_desc: 'Parcourez tous les clubs et leurs avis.',
    club_submit_title: 'Soumettre un club',
    club_submit_desc:
      'Vous connaissez un club à ajouter ? Envoyez les détails pour validation.',
    club_submit_name_label: 'Nom du club',
    club_submit_city_label: 'Ville',
    club_submit_country_label: 'Pays',
    club_submit_website_label: 'Site',
    club_submit_summary_label: 'Courte description',
    club_submit_summary_placeholder: 'Expliquez ce qui rend ce club unique...',
    club_submit_submit: 'Soumettre le club',
    club_submit_submitting: 'Soumission...',
    club_submit_signin_required: 'Connectez-vous pour soumettre un club.',
    club_submit_status_pending: 'Club soumis pour modération.',
    club_submit_status_error: 'Impossible de soumettre le club.',
    club_submit_permission_error: 'Soumission bloquée par les règles Firestore.',
    city_breadcrumb_home: 'Accueil',
    city_breadcrumb_clubs: 'Clubs',
    city_title_desc: 'Clubs et constellations liés à cette ville.',
    city_fallback: 'Cette ville',
    city_clubs_title: 'Clubs',
    city_constellations_title: 'Constellations',
    city_clubs_empty: 'Aucun club pour le moment.',
    city_constellations_empty: 'Aucune constellation pour le moment.',
    club_not_found_title: 'Club introuvable',
    club_not_found_body: 'Impossible de trouver ce club.',
    club_back: 'Retour aux clubs',
    club_description: 'Description',
    club_info: 'Infos utiles',
    club_city: 'Ville',
    club_country: 'Pays',
    club_date_visited: 'Date de visite',
    club_dress_code: 'Tenue',
    club_party_type: "Type de soirée",
    club_day_of_week: 'Jour de la semaine',
    club_website: 'Site',
    club_visit_site: 'Visiter',
    reviews_title: 'Avis',
    reviews_desc: 'Avis complets et notes de la communauté.',
    reviews_club_title: 'Avis du club',
    reviews_club_desc: 'Avis affichés après modération.',
    reviews_none: 'Aucun avis publié.',
    review_rating_label: 'Note',
    review_text_label: 'Avis',
    review_text_placeholder: 'Partagez votre expérience avec ce club...',
    review_submit: 'Soumettre pour validation',
    review_submitting: 'Soumission...',
    review_signin_required: 'Connectez-vous pour soumettre un avis.',
    review_status_pending: 'Avis soumis pour modération.',
    review_status_error: "Impossible d'envoyer l'avis.",
    review_permission_error: "Avis bloqué par les règles Firestore.",
    review_author_anonymous: 'anonyme',
    review_rating_status: 'Note : {rating}/5 · Statut : {status}',
    review_identity_label: 'Publier en tant que',
    review_identity_profile: 'Votre profil',
    review_identity_anonymous: 'Anonyme',
    status_pending: 'En attente',
    status_approved: 'Approuvé',
    status_rejected: 'Refusé',
    status_published: 'Publié',
    rating_option_5: '5 - Excellent',
    rating_option_4: '4 - Très bien',
    rating_option_3: '3 - Correct',
    rating_option_2: '2 - À améliorer',
    rating_option_1: '1 - Mauvais',
    map_page_title: "Carte des clubs d'Europe",
    map_page_desc: 'Vue debug de la carte des clubs.',
  },
  de: {
    site_tagline: 'Moderne Communities, wie Sternbilder kartiert.',
    nav_users: 'Nutzer',
    nav_constellations: 'Konstellationen',
    nav_clubs: 'Clubs',
    nav_events: 'Events',
    nav_map: 'Karte',
    nav_websites: 'Websites',
    nav_blog: 'Blog',
    nav_join: 'Beitreten',
    nav_review: 'Reviews',
    nav_admin: 'Admin',
    user_menu_label: 'Konto',
    user_menu_edit: 'Profil bearbeiten',
    user_menu_host: 'Host-Dashboard',
    user_menu_signout: 'Abmelden',
    profile_page_title: 'Dein Profil',
    profile_page_subtitle: 'Aktualisiere deine Angaben und Privatsphäre.',
    profile_save: 'Änderungen speichern',
    profile_saving: 'Speichern...',
    profile_saved: 'Profil aktualisiert.',
    profile_save_error: 'Profil konnte nicht aktualisiert werden.',
    profile_signin_prompt: 'Melde dich an, um dein Profil zu bearbeiten.',
    request_access: 'Zugang anfordern',
    link_section_title: 'Konstellations-Links',
    link_section_subtitle:
      'Anfragen senden, Zustimmung bestätigen und Sichtbarkeit wählen.',
    link_request_email_label: 'Anfrage per E-Mail',
    link_request_email_placeholder: 'partner@email.com',
    link_request_type_label: 'Beziehungstyp',
    link_request_send: 'Anfrage senden',
    link_request_sending: 'Senden...',
    link_request_status_sent: 'Anfrage gesendet.',
    link_request_status_missing: 'E-Mail eingeben, um eine Anfrage zu senden.',
    link_request_status_self: 'Du kannst dich nicht mit deiner eigenen E-Mail verknüpfen.',
    link_request_status_not_found: 'Kein Nutzer gefunden.',
    link_request_status_exists: 'Eine Anfrage existiert bereits.',
    link_request_status_error: 'Anfrage konnte nicht gesendet werden.',
    link_requests_incoming_title: 'Eingehende Anfragen',
    link_requests_outgoing_title: 'Ausgehende Anfragen',
    link_requests_confirmed_title: 'Bestätigte Links',
    link_requests_empty: 'Keine.',
    link_request_accept: 'Annehmen',
    link_request_decline: 'Ablehnen',
    link_request_merge_label: 'Sichtbarkeit zusammenlegen',
    link_request_merge_on: 'Zusammengelegt',
    link_request_merge_off: 'Unabhängig',
    photo_upload_label: 'Profilfoto',
    photo_upload_button: 'Hochladen',
    photo_upload_success: 'Foto aktualisiert.',
    photo_upload_error: 'Foto konnte nicht hochgeladen werden.',
    notifications_title: 'Benachrichtigungen',
    notifications_desc: 'Aktiviere Push-Benachrichtigungen fuer Einladungen.',
    notifications_enable: 'Benachrichtigungen aktivieren',
    notifications_disable: 'Benachrichtigungen deaktivieren',
    notifications_enabled: 'Benachrichtigungen aktiviert.',
    notifications_disabled: 'Benachrichtigungen deaktiviert.',
    notifications_blocked: 'Benachrichtigungen im Browser blockiert.',
    notifications_missing_key: 'VAPID-Schluessel fehlt.',
    notifications_error: 'Benachrichtigungen konnten nicht aktualisiert werden.',
    verification_title: 'Foto-Verifizierung',
    verification_desc: 'Lade ein Selfie mit dem Verifizierungscode hoch.',
    verification_phrase_label: 'Verifizierungscode',
    verification_phrase: 'LBS2025',
    verification_upload_label: 'Verifizierungsfoto',
    verification_submit: 'Verifizierung senden',
    verification_submitting: 'Senden...',
    verification_status_pending: 'Verifizierung zur Prufung gesendet.',
    verification_status_success: 'Verifizierung aktualisiert.',
    verification_status_error: 'Verifizierung konnte nicht gesendet werden.',
    verification_admin_title: 'Foto-Verifizierung',
    verification_admin_desc: 'Prufe eingereichte Selfies.',
    verification_admin_empty: 'Keine Anfragen.',
    verification_admin_approve: 'Freigeben',
    verification_admin_reject: 'Ablehnen',
    events_page_title: 'Partys & Events',
    events_page_desc: 'Kommende Events, Kontingente und Host-Freigaben.',
    event_privacy_label: 'Privatsphäre',
    event_privacy_public: 'Öffentlich',
    event_privacy_vetted: 'Geprüft',
    event_privacy_private: 'Privat',
    event_privacy_notice_public: 'Für alle sichtbar. Adresse wird angezeigt.',
    event_privacy_notice_vetted:
      'Für alle sichtbar. Adresse nach Freigabe.',
    event_privacy_notice_private: 'Nur auf Einladung. Nicht gelistet.',
    event_address_label: 'Ort',
    event_address_hidden: 'Adresse bis zur Freigabe verborgen.',
    event_cap_label: 'Gästelimit',
    event_cap_men: 'Männer',
    event_cap_women: 'Frauen',
    event_cap_couples: 'Paare',
    event_rsvp_title: 'RSVP',
    event_rsvp_desc: 'Kategorie wählen und Platz anfragen.',
    event_rsvp_category_label: 'Kategorie',
    event_rsvp_submit: 'RSVP senden',
    event_rsvp_sending: 'Senden...',
    event_rsvp_full: 'Kategorie ist voll.',
    event_rsvp_pending: 'RSVP wartet auf Freigabe.',
    event_rsvp_approved: 'RSVP bestätigt.',
    event_rsvp_declined: 'RSVP abgelehnt.',
    event_rsvp_error: 'RSVP konnte nicht gesendet werden.',
    event_rsvp_signed_out: 'Zum RSVP anmelden.',
    event_rsvp_qr_title: 'Check-in QR',
    event_rsvp_qr_desc: 'Zeige den Code am Eingang.',
    event_guest_manager_title: 'Guest Manager',
    event_guest_manager_desc: 'RSVPs und Trust Badges prüfen.',
    event_guest_manager_pending: 'Offene Anfragen',
    event_guest_manager_approved: 'Bestätigte Gäste',
    event_guest_manager_empty: 'Noch keine RSVPs.',
    event_guest_action_approve: 'Freigeben',
    event_guest_action_decline: 'Ablehnen',
    event_not_found_title: 'Event nicht gefunden',
    event_not_found_body: 'Dieses Event wurde nicht gefunden.',
    event_back: 'Zurück zu Events',
    event_live_status_label: 'Live-Status',
    event_live_status_open: 'Offen',
    event_live_status_full: 'Voll',
    event_live_status_last_call: 'Letzter Aufruf',
    event_live_update: 'Status aktualisieren',
    event_live_chat_title: 'Live-Chat',
    event_live_chat_placeholder: 'Nachricht eingeben...',
    event_live_chat_send: 'Senden',
    host_dashboard_title: 'Host-Dashboard',
    host_dashboard_desc: 'RSVPs deiner Events im Blick.',
    host_dashboard_empty: 'Noch keine Host-Events.',
    host_dashboard_signin: 'Melde dich an, um Host-Tools zu sehen.',
    footer_tagline: 'Community-Zuhause für Nutzer, Konstellationen, Clubs und Stories.',
    footer_guidelines: 'Richtlinien & Bedingungen',
    lang_select_label: 'Sprache wählen',
    hero_pill: 'Für Creator, Clubs und gemeinsame Geschichten',
    hero_title: 'Forme ein lebendiges Netzwerk aus Menschen, Clubs und Nächten.',
    hero_lead:
      'LedBySwing verbindet Menschen, Konstellationen und Clubs für Stories, Reviews und Reisetagebücher.',
    hero_paragraph:
      'Welcome to the next evolution of ethical non-monogamy. LedBySwing is a community-built platform designed for the way we actually live. Whether you are a solo explorer, part of an established couple, or a member of a complex constellation, we provide the tools to connect, organize, and thrive. No paywalls, no hidden fees—just an open, adult space dedicated to authentic connection and unforgettable events.',
    relationships_title: 'Your Relationships Are Unique. Your Platform Should Be Too.',
    relationships_body:
      'Traditional sites stop at "Single" or "Couple." We go further. From managing intricate polycules to hosting private events, LedBySwing is designed to handle the beautiful complexity of modern ethical non-monogamy. Bring your constellation home.',
    hero_cta_primary: 'Konstellation starten',
    hero_cta_secondary: 'Netz erkunden',
    metric_label: 'Aktive Nutzer',
    metric_caption: 'Wächst in 12 Regionen',
    register_page_title: 'Konto erstellen',
    register_page_subtitle:
      'Hier erstellst du ein Einzelkonto. Paare oder Konstellationen kannst du später hinzufügen.',
    auth_title: 'Konto erstellen',
    auth_subtitle:
      'Profile schalten Reviews, private Kalender und Einladungen frei.',
    register_kicker: 'Privater Community-Zugang',
    register_heading: 'Erstelle ein Profil mit Absicht.',
    register_body:
      'Jedes Konto wird geprüft. Browsen ist anonym möglich, Reviews brauchen ein Profil.',
    label_display_name: 'Anzeigename',
    label_email: 'E-Mail',
    label_password: 'Passwort',
    label_confirm_password: 'Passwort bestätigen',
    label_birth_date: 'Geburtsdatum',
    label_location: 'Ort',
    label_location_lat: 'Breitengrad',
    label_location_lng: 'Laengengrad',
    label_interests: 'Interessen',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ Zeichen',
    placeholder_confirm_password: 'Passwort erneut',
    placeholder_birth_date: 'JJJJ-MM-TT',
    placeholder_location: 'Stadt, Land',
    placeholder_location_lat: '52.52',
    placeholder_location_lng: '13.40',
    placeholder_interests: 'Offene Beziehungen, Voyeur, BDSM',
    interest_tag_1: 'Offene Beziehungen',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Social Events',
    consent_age: 'I confirm I am 18+ (or the legal age of majority in my jurisdiction).',
    consent_privacy: 'Profil privat halten, bis ich es veröffentliche.',
    consent_policy_prefix: 'I have read and agree to the ',
    consent_policy_link: 'Terms of Service and Community Guidelines',
    consent_policy_suffix: '.',
    register_create: 'Konto erstellen',
    register_creating: 'Konto wird erstellt...',
    register_google_cta: 'Konto mit Google erstellen',
    register_google_hint:
      'Nutze Google, um kein Passwort zu brauchen. Wir füllen die E-Mail vorab aus.',
    auth_sign_in_google: 'Mit Google anmelden',
    auth_sign_out: 'Abmelden',
    auth_status_setup: 'Anmeldung muss konfiguriert werden',
    auth_status_config: 'Anmeldung muss konfiguriert werden',
    auth_status_pending: 'Neue Konten werden vor Veröffentlichung geprüft',
    auth_sign_in_missing: 'Enter your email and password to sign in.',
    auth_sign_in_success: 'Signed in.',
    auth_sign_in_error: 'Unable to sign in. Please try again.',
    register_password_mismatch: 'Passwörter stimmen nicht überein.',
    register_underage: 'Du musst mindestens 18 Jahre alt sein.',
    register_status_success: 'Konto erstellt. Prüfung ausstehend.',
    register_status_permission:
      'Konto erstellt, aber Profilspeicherung durch Firestore blockiert.',
    register_status_error: 'Konto konnte nicht erstellt werden.',
    register_expect_label: 'Erwartung',
    register_expect_text: 'Sorgfältige Moderation und verifizierte Profile.',
    register_privacy_label: 'Privatsphäre',
    register_privacy_text: 'Wähle, was du vor der Veröffentlichung zeigst.',
    register_trust_label: 'Vertrauen',
    register_trust_text: 'Reviews sind an echte Profile gebunden.',
    register_have_account: 'Schon ein Konto?',
    register_sign_in: 'Anmelden',
    guidelines_page_title: 'Guidelines & Terms',
    guidelines_page_subtitle: 'Please read these policies before joining or hosting events.',
    terms_title: 'Terms of Service (The Legal Guardrails)',
    terms_eligibility_title: 'Eligibility & Age Verification',
    terms_eligibility_item_1:
      '18+ requirement: You must be at least 18 years old (or the legal age of majority in your jurisdiction) to access this site.',
    terms_eligibility_item_2:
      'Verification: We may require age assurance or ID matching to prevent underage access, especially before allowing participation in events.',
    terms_content_title: 'Content Ownership & License',
    terms_content_item_1: 'Your content: You retain ownership of the photos and text you upload.',
    terms_content_item_2:
      'Our license: By posting content, you grant us a non-exclusive, royalty-free license to host and display it for the purpose of operating the service.',
    terms_content_item_3:
      'Copyright (DMCA): We respect intellectual property. If you believe your work has been copied, use our designated takedown process.',
    terms_prohibited_title: 'Prohibited Content & Illegal Acts',
    terms_prohibited_item_1:
      'Zero tolerance: We strictly prohibit facilitation of sex trafficking (FOSTA-SESTA compliance) or any non-consensual sexual content.',
    terms_prohibited_item_2:
      'Illegal acts: Using the platform to promote illegal drugs, violence, or harm is grounds for immediate termination.',
    terms_liability_title: 'Limitation of Liability',
    terms_liability_item_1:
      'As-is service: LedBySwing is provided as-is without warranties of uptime or performance.',
    terms_liability_item_2:
      'Social interaction: We are not responsible for the behavior of users at offline events organized through the site.',
    guidelines_title: 'Community Guidelines (The Vibe & Ethics)',
    guidelines_core_title: 'The C.O.R.E. Principles',
    guidelines_core_item_1:
      'Consent: Verbal, active, and enthusiastic consent is mandatory for all interactions, both digital and physical.',
    guidelines_core_item_2:
      'Openness: We are an inclusive space. We welcome all genders, orientations, and relationship structures (monogamous-ish to complex polycules).',
    guidelines_core_item_3:
      'Respect: Treat others with dignity. Harassment, hunting, or aggressive behavior is not tolerated.',
    guidelines_core_item_4:
      'Ethics: We value transparency. Always be honest about your relationship status and the boundaries of your constellation.',
    guidelines_constellation_title: 'Constellation Etiquette',
    guidelines_constellation_item_1:
      'Linked profiles: When linking accounts into a constellation, ensure all parties have consented to being displayed together.',
    guidelines_constellation_item_2:
      "Privacy: Never share another member's real-world identity or private photos without explicit permission.",
    guidelines_event_title: 'Event Safety',
    guidelines_event_item_1:
      'Host rights: Event organizers have the right to set their own vetting requirements (e.g., ID checks or references) for private gatherings.',
    guidelines_event_item_2:
      'Reporting: If you witness unsafe behavior at an event or on the site, use our Flag tool. We prioritize reports involving non-consensual behavior.',
    users_title: 'Nutzer',
    users_subtitle: 'Profile, Rollen und Aktivität treiben Konstellationen an.',
    users_card_profiles_title: 'Profile',
    users_card_profiles_body: 'Profile mit Rollen, Pronomen und Interessen.',
    users_card_profiles_item1: 'Eigene Tags',
    users_card_profiles_item2: 'Verfügbarkeitsstatus',
    users_card_profiles_item3: 'Geteilte Interessen',
    users_card_trust_title: 'Community-Vertrauen',
    users_card_trust_body: 'Momentum wächst durch Beiträge und Stories.',
    users_card_trust_item1: 'Empfehlungen',
    users_card_trust_item2: 'Event-Teilnahme',
    users_card_trust_item3: 'Story-Impact',
    users_card_privacy_title: 'Privatsphäre',
    users_card_privacy_body: 'Wähle deine Sichtbarkeit über Clubs hinweg.',
    users_card_privacy_item1: 'Sichtbarkeit pro Club',
    users_card_privacy_item2: 'Story-Gating',
    users_card_privacy_item3: 'Aktivität maskieren',
    const_title: 'Konstellationen',
    const_subtitle: 'Jede Konstellation besteht aus zwei oder mehr Nutzern.',
    const_card_title: 'Kollaborative Cluster',
    const_card_body:
      'Konstellationen für Mentoring, Co‑Creation oder Launches.',
    const_tag1: '2+ Nutzer',
    const_tag2: 'Gemeinsame Mission',
    const_tag3: 'Zeitlich begrenzt',
    clubs_title: 'Clubs',
    clubs_subtitle: 'Unabhängige Orte mit Events, Posts und Konstellationen.',
    clubs_card1_title: 'Mitgliedschafts-Levels',
    clubs_card1_body: 'Zugangsstufen für Gäste, Mitglieder und Botschafter.',
    clubs_card1_item1: 'Einladungspflicht',
    clubs_card1_item2: 'Event-Check-ins',
    clubs_card1_item3: 'Retention-Heatmaps',
    clubs_card2_title: 'Club-Spaces',
    clubs_card2_body: 'Clubseiten mit Kalendern, Galerien und Posts.',
    clubs_card2_item1: 'Multi-Admin',
    clubs_card2_item2: 'Themen-Presets',
    clubs_card2_item3: 'Schnelles Publishing',
    clubs_card3_title: 'Gemeinsames Wachstum',
    clubs_card3_body: 'Sieh, was aus jedem Club wächst.',
    clubs_card3_item1: 'Story-Attribution',
    clubs_card3_item2: 'Club-Verbindungen',
    clubs_card3_item3: 'Wachstums-Kohorten',
    clubs_highlights_title: 'Club-Highlights',
    clubs_highlights_body: 'Empfohlene Clubs zum Einstieg.',
    clubs_loading: 'Lädt...',
    map_title: 'Europa-Clubkarte',
    map_desc: 'Sieh, wo sich die Community trifft.',
    map_aria: 'OpenStreetMap von Europa',
    map_pin_open: 'Öffne {name}',
    websites_title: 'Websites',
    websites_desc: 'Launch von Markenauftritten mit Profilen und Stories.',
    websites_card1_title: 'Lebendige Seiten',
    websites_card1_body: 'Zeige Kalender, Teams und Konstellationen.',
    websites_card1_item1: 'Adaptive Templates',
    websites_card1_item2: 'Mehrsprachige Texte',
    websites_card1_item3: 'SEO-freundlich',
    websites_card2_title: 'Sichtbarkeit',
    websites_card2_body: 'Clubs sichtbar machen und Stories auffindbar halten.',
    websites_card2_item1: 'Geteilte Kalender',
    websites_card2_item2: 'Story-Archive',
    websites_card2_item3: 'Community-Highlights',
    websites_card3_title: 'Stewardship',
    websites_card3_body: 'Freigaben und Publishing im Einklang.',
    websites_card3_item1: 'Redaktionsflows',
    websites_card3_item2: 'Mitgliederrollen',
    websites_card3_item3: 'Edit-Historie',
    website_visit: 'Website besuchen',
    blog_title: 'Blogbeiträge',
    blog_desc: 'Stories rund um Nutzer, Konstellationen und Reisen.',
    blog_loading: 'Archiv wird geladen...',
    moderation_title: 'Review-Queue',
    moderation_desc: 'Neue Profile und Reviews warten auf Freigabe.',
    moderation_pending_label: 'Offene Reviews',
    moderation_pending_desc: 'Vor Veröffentlichung prüfen.',
    moderation_queue_label: 'Queue',
    moderation_queue_empty: 'Keine Reviews in der Queue.',
    moderation_admin_only_title: 'Nur Admins',
    moderation_admin_only_desc: 'Als Admin anmelden, um zu moderieren.',
    moderation_open_admin: 'Admin-Panel öffnen',
    admin_title: 'Admin-Panel',
    admin_subtitle: 'Reviews moderieren und sicher veröffentlichen.',
    admin_access_denied_title: 'Zugriff verweigert',
    admin_access_denied_body: 'Du brauchst ein Admin-Konto.',
    admin_back_home: 'Zurück zur Startseite',
    admin_pending_title: 'Offene Reviews',
    admin_pending_desc: 'Reviews mit Entscheidungsbedarf.',
    admin_approved_title: 'Freigegebene Reviews',
    admin_approved_desc: 'Zuletzt veröffentlichte Reviews.',
    admin_queue_title: 'Moderations-Queue',
    admin_action_approve: 'Freigeben',
    admin_action_reject: 'Ablehnen',
    admin_no_pending: 'Keine offenen Reviews.',
    admin_recent_title: 'Zuletzt freigegeben',
    admin_recent_empty: 'Keine freigegebenen Reviews.',
    admin_events_title: 'Event-Moderation',
    admin_events_desc: 'Prüfe ausstehende RSVPs für alle Events.',
    admin_events_empty: 'Keine ausstehenden Event-RSVPs.',
    clubs_page_title: 'Clubs',
    clubs_page_desc: 'Alle Clubs durchsuchen und Details öffnen.',
    club_submit_title: 'Club vorschlagen',
    club_submit_desc:
      'Kennst du einen Club, den wir aufnehmen sollen? Sende die Details zur Prüfung.',
    club_submit_name_label: 'Clubname',
    club_submit_city_label: 'Stadt',
    club_submit_country_label: 'Land',
    club_submit_website_label: 'Website',
    club_submit_summary_label: 'Kurzbeschreibung',
    club_submit_summary_placeholder:
      'Beschreibe, was diesen Club besonders macht...',
    club_submit_submit: 'Club senden',
    club_submit_submitting: 'Senden...',
    club_submit_signin_required: 'Melde dich an, um einen Club vorzuschlagen.',
    club_submit_status_pending: 'Club zur Moderation eingereicht.',
    club_submit_status_error: 'Club konnte nicht gesendet werden.',
    club_submit_permission_error:
      'Club-Einreichung durch Firestore-Regeln blockiert.',
    city_breadcrumb_home: 'Start',
    city_breadcrumb_clubs: 'Clubs',
    city_title_desc: 'Clubs und Konstellationen in dieser Stadt.',
    city_fallback: 'Diese Stadt',
    city_clubs_title: 'Clubs',
    city_constellations_title: 'Konstellationen',
    city_clubs_empty: 'Noch keine Clubs.',
    city_constellations_empty: 'Noch keine Konstellationen.',
    club_not_found_title: 'Club nicht gefunden',
    club_not_found_body: 'Dieser Club wurde nicht gefunden.',
    club_back: 'Zurück zu den Clubs',
    club_description: 'Beschreibung',
    club_info: 'Infos',
    club_city: 'Stadt',
    club_country: 'Land',
    club_date_visited: 'Besuchsdatum',
    club_dress_code: 'Dresscode',
    club_party_type: 'Partytyp',
    club_day_of_week: 'Wochentag',
    club_website: 'Website',
    club_visit_site: 'Besuchen',
    reviews_title: 'Reviews',
    reviews_desc: 'Reviews und Community-Notizen.',
    reviews_club_title: 'Club-Reviews',
    reviews_club_desc: 'Reviews erscheinen nach Moderation.',
    reviews_none: 'Keine Reviews veröffentlicht.',
    review_rating_label: 'Bewertung',
    review_text_label: 'Review',
    review_text_placeholder: 'Teile deine Erfahrung mit diesem Club...',
    review_submit: 'Zur Prüfung senden',
    review_submitting: 'Senden...',
    review_signin_required: 'Zum Einreichen anmelden.',
    review_status_pending: 'Review zur Moderation gesendet.',
    review_status_error: 'Review konnte nicht gesendet werden.',
    review_permission_error: 'Review durch Firestore-Regeln blockiert.',
    review_author_anonymous: 'anonym',
    review_rating_status: 'Bewertung: {rating}/5 · Status: {status}',
    review_identity_label: 'Veröffentlichen als',
    review_identity_profile: 'Dein Profil',
    review_identity_anonymous: 'Anonym',
    status_pending: 'Ausstehend',
    status_approved: 'Genehmigt',
    status_rejected: 'Abgelehnt',
    status_published: 'Veröffentlicht',
    rating_option_5: '5 - Exzellent',
    rating_option_4: '4 - Sehr gut',
    rating_option_3: '3 - Solide',
    rating_option_2: '2 - Verbesserungsbedarf',
    rating_option_1: '1 - Schwach',
    map_page_title: 'Europa-Clubkarte',
    map_page_desc: 'Debug-Ansicht der Clubkarte.',
  },
  it: {
    site_tagline: 'Comunità moderne mappate come costellazioni.',
    nav_users: 'Utenti',
    nav_constellations: 'Costellazioni',
    nav_clubs: 'Club',
    nav_events: 'Eventi',
    nav_map: 'Mappa',
    nav_websites: 'Siti',
    nav_blog: 'Blog',
    nav_join: 'Unisciti',
    nav_review: 'Recensioni',
    nav_admin: 'Admin',
    user_menu_label: 'Account',
    user_menu_edit: 'Modifica profilo',
    user_menu_host: 'Dashboard host',
    user_menu_signout: 'Esci',
    profile_page_title: 'Il tuo profilo',
    profile_page_subtitle: 'Aggiorna i dati e le impostazioni privacy.',
    profile_save: 'Salva modifiche',
    profile_saving: 'Salvataggio...',
    profile_saved: 'Profilo aggiornato.',
    profile_save_error: 'Impossibile aggiornare il profilo.',
    profile_signin_prompt: 'Accedi per modificare il profilo.',
    request_access: 'Richiedi accesso',
    link_section_title: 'Legami della costellazione',
    link_section_subtitle:
      'Invia richieste, conferma il consenso e scegli la visibilità.',
    link_request_email_label: 'Richiesta via email',
    link_request_email_placeholder: 'partner@email.com',
    link_request_type_label: 'Tipo di legame',
    link_request_send: 'Invia richiesta',
    link_request_sending: 'Invio...',
    link_request_status_sent: 'Richiesta inviata.',
    link_request_status_missing: 'Inserisci un email per inviare la richiesta.',
    link_request_status_self: 'Non puoi collegarti alla tua email.',
    link_request_status_not_found: 'Nessun utente trovato.',
    link_request_status_exists: 'La richiesta esiste già.',
    link_request_status_error: 'Impossibile inviare la richiesta.',
    link_requests_incoming_title: 'Richieste in arrivo',
    link_requests_outgoing_title: 'Richieste inviate',
    link_requests_confirmed_title: 'Legami confermati',
    link_requests_empty: 'Nessuna.',
    link_request_accept: 'Accetta',
    link_request_decline: 'Rifiuta',
    link_request_merge_label: 'Unisci visibilità di ricerca',
    link_request_merge_on: 'Uniti',
    link_request_merge_off: 'Indipendenti',
    photo_upload_label: 'Foto profilo',
    photo_upload_button: 'Carica',
    photo_upload_success: 'Foto aggiornata.',
    photo_upload_error: 'Impossibile caricare la foto.',
    notifications_title: 'Notifiche',
    notifications_desc: 'Abilita le notifiche per inviti e aggiornamenti.',
    notifications_enable: 'Abilita notifiche',
    notifications_disable: 'Disabilita notifiche',
    notifications_enabled: 'Notifiche abilitate.',
    notifications_disabled: 'Notifiche disabilitate.',
    notifications_blocked: 'Notifiche bloccate nel browser.',
    notifications_missing_key: 'Chiave VAPID mancante.',
    notifications_error: 'Impossibile aggiornare le notifiche.',
    verification_title: 'Verifica foto',
    verification_desc: 'Carica un selfie con la frase di verifica.',
    verification_phrase_label: 'Frase di verifica',
    verification_phrase: 'LBS2025',
    verification_upload_label: 'Foto di verifica',
    verification_submit: 'Invia verifica',
    verification_submitting: 'Invio...',
    verification_status_pending: 'Verifica inviata per revisione.',
    verification_status_success: 'Verifica aggiornata.',
    verification_status_error: 'Impossibile inviare la verifica.',
    verification_admin_title: 'Verifica foto',
    verification_admin_desc: 'Revisiona i selfie di verifica.',
    verification_admin_empty: 'Nessuna richiesta.',
    verification_admin_approve: 'Approva',
    verification_admin_reject: 'Rifiuta',
    events_page_title: 'Party & eventi',
    events_page_desc: 'Eventi in arrivo, cap e stato di approvazione.',
    event_privacy_label: 'Privacy',
    event_privacy_public: 'Pubblico',
    event_privacy_vetted: 'Vaglio',
    event_privacy_private: 'Privato',
    event_privacy_notice_public: 'Visibile a tutti. Indirizzo condiviso.',
    event_privacy_notice_vetted: 'Visibile a tutti. Indirizzo dopo approvazione.',
    event_privacy_notice_private: 'Solo su invito. Nascosto.',
    event_address_label: 'Luogo',
    event_address_hidden: 'Indirizzo nascosto fino all’approvazione.',
    event_cap_label: 'Capienza',
    event_cap_men: 'Uomini',
    event_cap_women: 'Donne',
    event_cap_couples: 'Coppie',
    event_rsvp_title: 'RSVP',
    event_rsvp_desc: 'Scegli una categoria per richiedere un posto.',
    event_rsvp_category_label: 'Categoria',
    event_rsvp_submit: 'Invia RSVP',
    event_rsvp_sending: 'Invio...',
    event_rsvp_full: 'Categoria piena.',
    event_rsvp_pending: 'RSVP in attesa.',
    event_rsvp_approved: 'RSVP approvato.',
    event_rsvp_declined: 'RSVP rifiutato.',
    event_rsvp_error: 'Impossibile inviare RSVP.',
    event_rsvp_signed_out: 'Accedi per RSVP.',
    event_rsvp_qr_title: 'QR di check-in',
    event_rsvp_qr_desc: 'Mostra il codice all’ingresso.',
    event_guest_manager_title: 'Guest Manager',
    event_guest_manager_desc: 'Valuta gli RSVP e i badge.',
    event_guest_manager_pending: 'Richieste in attesa',
    event_guest_manager_approved: 'Ospiti approvati',
    event_guest_manager_empty: 'Nessun RSVP.',
    event_guest_action_approve: 'Approva',
    event_guest_action_decline: 'Rifiuta',
    event_not_found_title: 'Evento non trovato',
    event_not_found_body: 'Impossibile trovare questo evento.',
    event_back: 'Torna agli eventi',
    event_live_status_label: 'Stato live',
    event_live_status_open: 'Aperto',
    event_live_status_full: 'Completo',
    event_live_status_last_call: 'Ultima chiamata',
    event_live_update: 'Aggiorna stato',
    event_live_chat_title: 'Chat live',
    event_live_chat_placeholder: 'Scrivi un messaggio...',
    event_live_chat_send: 'Invia',
    host_dashboard_title: 'Dashboard host',
    host_dashboard_desc: 'Monitora gli RSVP dei tuoi eventi.',
    host_dashboard_empty: 'Nessun evento ospitato.',
    host_dashboard_signin: 'Accedi per vedere gli strumenti host.',
    footer_tagline: 'Casa della community per utenti, costellazioni, club e storie.',
    footer_guidelines: 'Linee guida e termini',
    lang_select_label: 'Seleziona lingua',
    hero_pill: 'Per creator, club e storie condivise',
    hero_title: 'Crea una rete viva di persone, club e notti indimenticabili.',
    hero_lead:
      'LedBySwing unisce persone, costellazioni e club per storie, recensioni e diari di viaggio.',
    hero_paragraph:
      'Welcome to the next evolution of ethical non-monogamy. LedBySwing is a community-built platform designed for the way we actually live. Whether you are a solo explorer, part of an established couple, or a member of a complex constellation, we provide the tools to connect, organize, and thrive. No paywalls, no hidden fees—just an open, adult space dedicated to authentic connection and unforgettable events.',
    relationships_title: 'Your Relationships Are Unique. Your Platform Should Be Too.',
    relationships_body:
      'Traditional sites stop at "Single" or "Couple." We go further. From managing intricate polycules to hosting private events, LedBySwing is designed to handle the beautiful complexity of modern ethical non-monogamy. Bring your constellation home.',
    hero_cta_primary: 'Lancia una costellazione',
    hero_cta_secondary: 'Esplora il grafo',
    metric_label: 'Utenti attivi',
    metric_caption: 'In crescita in 12 regioni',
    register_page_title: 'Crea il tuo account',
    register_page_subtitle:
      'Qui crei un account per una sola persona. Coppie o costellazioni potrai aggiungerle più tardi.',
    auth_title: 'Crea il tuo account',
    auth_subtitle:
      'I profili sbloccano recensioni, calendari privati e inviti.',
    register_kicker: 'Accesso privato alla community',
    register_heading: 'Costruisci un profilo con intenzione.',
    register_body:
      'Ogni account viene verificato. Puoi navigare anonimamente, ma le recensioni richiedono un profilo.',
    label_display_name: 'Nome visualizzato',
    label_email: 'Email',
    label_password: 'Password',
    label_confirm_password: 'Conferma password',
    label_birth_date: 'Data di nascita',
    label_location: 'Località',
    label_location_lat: 'Latitudine',
    label_location_lng: 'Longitudine',
    label_interests: 'Interessi',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ caratteri',
    placeholder_confirm_password: 'Reinserisci la password',
    placeholder_birth_date: 'AAAA-MM-GG',
    placeholder_location: 'Città, Paese',
    placeholder_location_lat: '41.90',
    placeholder_location_lng: '12.49',
    placeholder_interests: 'Relazioni aperte, Voyeur, BDSM',
    interest_tag_1: 'Relazioni aperte',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Eventi sociali',
    consent_age: 'I confirm I am 18+ (or the legal age of majority in my jurisdiction).',
    consent_privacy: 'Mantieni il profilo privato finché non pubblico.',
    consent_policy_prefix: 'I have read and agree to the ',
    consent_policy_link: 'Terms of Service and Community Guidelines',
    consent_policy_suffix: '.',
    register_create: 'Crea account',
    register_creating: 'Creazione...',
    register_google_cta: 'Crea un account con Google',
    register_google_hint: "Usa Google per evitare la password. Precompiliamo l'email.",
    auth_sign_in_google: 'Accedi con Google',
    auth_sign_out: 'Esci',
    auth_status_setup: 'Configurazione accesso richiesta',
    auth_status_config: 'Configurazione accesso richiesta',
    auth_status_pending: 'I nuovi account vengono verificati prima della pubblicazione',
    auth_sign_in_missing: 'Enter your email and password to sign in.',
    auth_sign_in_success: 'Signed in.',
    auth_sign_in_error: 'Unable to sign in. Please try again.',
    register_password_mismatch: 'Le password non corrispondono.',
    register_underage: 'Devi avere almeno 18 anni.',
    register_status_success: 'Account creato. In attesa di revisione.',
    register_status_permission:
      'Account creato, ma il profilo è bloccato dalle regole Firestore.',
    register_status_error: 'Impossibile creare l’account.',
    register_expect_label: 'Aspettati',
    register_expect_text: 'Moderazione attenta e profili verificati.',
    register_privacy_label: 'Privacy',
    register_privacy_text: 'Scegli cosa mostrare prima di pubblicare.',
    register_trust_label: 'Fiducia',
    register_trust_text: 'Le recensioni sono legate a profili reali.',
    register_have_account: 'Hai già un account?',
    register_sign_in: 'Accedi',
    guidelines_page_title: 'Guidelines & Terms',
    guidelines_page_subtitle: 'Please read these policies before joining or hosting events.',
    terms_title: 'Terms of Service (The Legal Guardrails)',
    terms_eligibility_title: 'Eligibility & Age Verification',
    terms_eligibility_item_1:
      '18+ requirement: You must be at least 18 years old (or the legal age of majority in your jurisdiction) to access this site.',
    terms_eligibility_item_2:
      'Verification: We may require age assurance or ID matching to prevent underage access, especially before allowing participation in events.',
    terms_content_title: 'Content Ownership & License',
    terms_content_item_1: 'Your content: You retain ownership of the photos and text you upload.',
    terms_content_item_2:
      'Our license: By posting content, you grant us a non-exclusive, royalty-free license to host and display it for the purpose of operating the service.',
    terms_content_item_3:
      'Copyright (DMCA): We respect intellectual property. If you believe your work has been copied, use our designated takedown process.',
    terms_prohibited_title: 'Prohibited Content & Illegal Acts',
    terms_prohibited_item_1:
      'Zero tolerance: We strictly prohibit facilitation of sex trafficking (FOSTA-SESTA compliance) or any non-consensual sexual content.',
    terms_prohibited_item_2:
      'Illegal acts: Using the platform to promote illegal drugs, violence, or harm is grounds for immediate termination.',
    terms_liability_title: 'Limitation of Liability',
    terms_liability_item_1:
      'As-is service: LedBySwing is provided as-is without warranties of uptime or performance.',
    terms_liability_item_2:
      'Social interaction: We are not responsible for the behavior of users at offline events organized through the site.',
    guidelines_title: 'Community Guidelines (The Vibe & Ethics)',
    guidelines_core_title: 'The C.O.R.E. Principles',
    guidelines_core_item_1:
      'Consent: Verbal, active, and enthusiastic consent is mandatory for all interactions, both digital and physical.',
    guidelines_core_item_2:
      'Openness: We are an inclusive space. We welcome all genders, orientations, and relationship structures (monogamous-ish to complex polycules).',
    guidelines_core_item_3:
      'Respect: Treat others with dignity. Harassment, hunting, or aggressive behavior is not tolerated.',
    guidelines_core_item_4:
      'Ethics: We value transparency. Always be honest about your relationship status and the boundaries of your constellation.',
    guidelines_constellation_title: 'Constellation Etiquette',
    guidelines_constellation_item_1:
      'Linked profiles: When linking accounts into a constellation, ensure all parties have consented to being displayed together.',
    guidelines_constellation_item_2:
      "Privacy: Never share another member's real-world identity or private photos without explicit permission.",
    guidelines_event_title: 'Event Safety',
    guidelines_event_item_1:
      'Host rights: Event organizers have the right to set their own vetting requirements (e.g., ID checks or references) for private gatherings.',
    guidelines_event_item_2:
      'Reporting: If you witness unsafe behavior at an event or on the site, use our Flag tool. We prioritize reports involving non-consensual behavior.',
    users_title: 'Utenti',
    users_subtitle: 'Profili, ruoli e attività condivisa alimentano le costellazioni.',
    users_card_profiles_title: 'Profili',
    users_card_profiles_body: 'Profili con ruoli, pronomi e interessi.',
    users_card_profiles_item1: 'Tag personalizzati',
    users_card_profiles_item2: 'Stato disponibilità',
    users_card_profiles_item3: 'Interessi condivisi',
    users_card_trust_title: 'Fiducia',
    users_card_trust_body: 'La community cresce quando si condividono storie.',
    users_card_trust_item1: 'Apprezzamenti',
    users_card_trust_item2: 'Presenza eventi',
    users_card_trust_item3: 'Impatto delle storie',
    users_card_privacy_title: 'Scelte di privacy',
    users_card_privacy_body: 'Scegli la visibilità nei club e costellazioni.',
    users_card_privacy_item1: 'Visibilità per club',
    users_card_privacy_item2: 'Controllo storie',
    users_card_privacy_item3: 'Mascheramento attività',
    const_title: 'Costellazioni',
    const_subtitle: 'Ogni costellazione riunisce due o più utenti.',
    const_card_title: 'Cluster collaborativi',
    const_card_body:
      'Costruisci costellazioni per mentoring, co‑creazione o lanci.',
    const_tag1: '2+ utenti',
    const_tag2: 'Missione condivisa',
    const_tag3: 'Durata limitata',
    clubs_title: 'Club',
    clubs_subtitle: 'Spazi indipendenti con eventi, post e costellazioni.',
    clubs_card1_title: 'Percorsi membership',
    clubs_card1_body: 'Accessi a livelli per ospiti, membri e ambassador.',
    clubs_card1_item1: 'Ingressi su invito',
    clubs_card1_item2: 'Check-in eventi',
    clubs_card1_item3: 'Heatmap retention',
    clubs_card2_title: 'Spazi club',
    clubs_card2_body: 'Siti dedicati con calendari, gallerie e post.',
    clubs_card2_item1: 'Multi-admin',
    clubs_card2_item2: 'Preset temi',
    clubs_card2_item3: 'Pubblicazione rapida',
    clubs_card3_title: 'Crescita condivisa',
    clubs_card3_body: 'Vedi cosa cresce da ogni club.',
    clubs_card3_item1: 'Attribuzione storie',
    clubs_card3_item2: 'Connessioni club',
    clubs_card3_item3: 'Cohort di crescita',
    clubs_highlights_title: 'Club in evidenza',
    clubs_highlights_body: 'Club consigliati per iniziare.',
    clubs_loading: 'Caricamento...',
    map_title: 'Mappa club Europa',
    map_desc: 'Vedi dove si incontra la community in Europa.',
    map_aria: 'OpenStreetMap d’Europa',
    map_pin_open: 'Apri {name}',
    websites_title: 'Siti',
    websites_desc: 'Lancia siti di brand con profili e storie.',
    websites_card1_title: 'Pagine vive',
    websites_card1_body: 'Evidenzia calendari, team e costellazioni.',
    websites_card1_item1: 'Template adattivi',
    websites_card1_item2: 'Copy multilingue',
    websites_card1_item3: 'SEO-friendly',
    websites_card2_title: 'Visibilità',
    websites_card2_body: 'Mostra i club e rendi le storie scopribili.',
    websites_card2_item1: 'Calendari condivisi',
    websites_card2_item2: 'Archivi storie',
    websites_card2_item3: 'Highlights community',
    websites_card3_title: 'Gestione',
    websites_card3_body: 'Allinea approvazioni e pubblicazioni.',
    websites_card3_item1: 'Flussi editoriali',
    websites_card3_item2: 'Ruoli membri',
    websites_card3_item3: 'Cronologia modifiche',
    website_visit: 'Visita sito',
    blog_title: 'Post del blog',
    blog_desc: 'Racconti legati a utenti, costellazioni e viaggi.',
    blog_loading: 'Caricamento archivio...',
    moderation_title: 'Coda recensioni',
    moderation_desc: 'Nuovi profili e recensioni attendono la revisione.',
    moderation_pending_label: 'Recensioni in attesa',
    moderation_pending_desc: 'Approva o rifiuta prima della pubblicazione.',
    moderation_queue_label: 'Coda',
    moderation_queue_empty: 'Nessuna recensione in coda.',
    moderation_admin_only_title: 'Solo admin',
    moderation_admin_only_desc: 'Accedi come admin per moderare.',
    moderation_open_admin: 'Apri pannello admin',
    admin_title: 'Pannello admin',
    admin_subtitle: 'Modera le recensioni e pubblica con fiducia.',
    admin_access_denied_title: 'Accesso negato',
    admin_access_denied_body: 'Serve un account admin.',
    admin_back_home: 'Torna alla home',
    admin_pending_title: 'Recensioni in attesa',
    admin_pending_desc: 'Recensioni in attesa di decisione.',
    admin_approved_title: 'Recensioni approvate',
    admin_approved_desc: 'Recensioni pubblicate di recente.',
    admin_queue_title: 'Coda moderazione',
    admin_action_approve: 'Approva',
    admin_action_reject: 'Rifiuta',
    admin_no_pending: 'Nessuna recensione in attesa.',
    admin_recent_title: 'Approvate di recente',
    admin_recent_empty: 'Nessuna recensione approvata.',
    admin_events_title: 'Moderazione eventi',
    admin_events_desc: 'Rivedi le RSVP in sospeso per tutti gli eventi.',
    admin_events_empty: 'Nessuna RSVP evento in sospeso.',
    clubs_page_title: 'Club',
    clubs_page_desc: 'Sfoglia i club e apri i dettagli.',
    club_submit_title: 'Invia un club',
    club_submit_desc:
      'Conosci un club da aggiungere? Invia i dettagli per la revisione.',
    club_submit_name_label: 'Nome del club',
    club_submit_city_label: 'Città',
    club_submit_country_label: 'Paese',
    club_submit_website_label: 'Sito',
    club_submit_summary_label: 'Breve descrizione',
    club_submit_summary_placeholder:
      'Racconta cosa rende speciale questo club...',
    club_submit_submit: 'Invia il club',
    club_submit_submitting: 'Invio...',
    club_submit_signin_required: 'Accedi per inviare un club.',
    club_submit_status_pending: 'Club inviato per moderazione.',
    club_submit_status_error: 'Impossibile inviare il club.',
    club_submit_permission_error:
      'Invio del club bloccato dalle regole Firestore.',
    city_breadcrumb_home: 'Home',
    city_breadcrumb_clubs: 'Club',
    city_title_desc: 'Club e costellazioni legati a questa città.',
    city_fallback: 'Questa città',
    city_clubs_title: 'Club',
    city_constellations_title: 'Costellazioni',
    city_clubs_empty: 'Nessun club ancora.',
    city_constellations_empty: 'Nessuna costellazione ancora.',
    club_not_found_title: 'Club non trovato',
    club_not_found_body: 'Non abbiamo trovato quel club.',
    club_back: 'Torna ai club',
    club_description: 'Descrizione',
    club_info: 'Informazioni utili',
    club_city: 'Città',
    club_country: 'Paese',
    club_date_visited: 'Data visita',
    club_dress_code: 'Dress code',
    club_party_type: 'Tipo di party',
    club_day_of_week: 'Giorno della settimana',
    club_website: 'Sito',
    club_visit_site: 'Visita',
    reviews_title: 'Recensioni',
    reviews_desc: 'Recensioni complete e note della community.',
    reviews_club_title: 'Recensioni del club',
    reviews_club_desc: 'Le recensioni appaiono dopo la moderazione.',
    reviews_none: 'Nessuna recensione pubblicata.',
    review_rating_label: 'Valutazione',
    review_text_label: 'Recensione',
    review_text_placeholder: 'Racconta la tua esperienza con questo club...',
    review_submit: 'Invia per revisione',
    review_submitting: 'Invio...',
    review_signin_required: 'Accedi per inviare una recensione.',
    review_status_pending: 'Recensione inviata per moderazione.',
    review_status_error: 'Impossibile inviare la recensione.',
    review_permission_error: 'Recensione bloccata dalle regole Firestore.',
    review_author_anonymous: 'anonimo',
    review_rating_status: 'Valutazione: {rating}/5 · Stato: {status}',
    review_identity_label: 'Pubblica come',
    review_identity_profile: 'Il tuo profilo',
    review_identity_anonymous: 'Anonimo',
    status_pending: 'In attesa',
    status_approved: 'Approvata',
    status_rejected: 'Rifiutata',
    status_published: 'Pubblicata',
    rating_option_5: '5 - Eccellente',
    rating_option_4: '4 - Ottimo',
    rating_option_3: '3 - Buono',
    rating_option_2: '2 - Da migliorare',
    rating_option_1: '1 - Scarso',
    map_page_title: 'Mappa club Europa',
    map_page_desc: 'Vista debug della mappa dei club.',
  },
  es: {
    site_tagline: 'Comunidades modernas mapeadas como constelaciones.',
    nav_users: 'Usuarios',
    nav_constellations: 'Constelaciones',
    nav_clubs: 'Clubes',
    nav_events: 'Eventos',
    nav_map: 'Mapa',
    nav_websites: 'Sitios',
    nav_blog: 'Blog',
    nav_join: 'Unirse',
    nav_review: 'Reseñas',
    nav_admin: 'Admin',
    user_menu_label: 'Cuenta',
    user_menu_edit: 'Editar perfil',
    user_menu_host: 'Panel de anfitrión',
    user_menu_signout: 'Cerrar sesión',
    profile_page_title: 'Tu perfil',
    profile_page_subtitle: 'Actualiza tus datos y la privacidad.',
    profile_save: 'Guardar cambios',
    profile_saving: 'Guardando...',
    profile_saved: 'Perfil actualizado.',
    profile_save_error: 'No se pudo actualizar el perfil.',
    profile_signin_prompt: 'Inicia sesión para editar tu perfil.',
    request_access: 'Solicitar acceso',
    link_section_title: 'Vínculos de constelación',
    link_section_subtitle:
      'Envía solicitudes, confirma consentimiento y elige visibilidad.',
    link_request_email_label: 'Solicitud por email',
    link_request_email_placeholder: 'partner@email.com',
    link_request_type_label: 'Tipo de vínculo',
    link_request_send: 'Enviar solicitud',
    link_request_sending: 'Enviando...',
    link_request_status_sent: 'Solicitud enviada.',
    link_request_status_missing: 'Ingresa un email para enviar la solicitud.',
    link_request_status_self: 'No puedes vincular tu propio email.',
    link_request_status_not_found: 'No se encontró usuario.',
    link_request_status_exists: 'La solicitud ya existe.',
    link_request_status_error: 'No se pudo enviar la solicitud.',
    link_requests_incoming_title: 'Solicitudes entrantes',
    link_requests_outgoing_title: 'Solicitudes enviadas',
    link_requests_confirmed_title: 'Vínculos confirmados',
    link_requests_empty: 'Ninguno.',
    link_request_accept: 'Aceptar',
    link_request_decline: 'Rechazar',
    link_request_merge_label: 'Unir visibilidad de búsqueda',
    link_request_merge_on: 'Unidos',
    link_request_merge_off: 'Independientes',
    photo_upload_label: 'Foto de perfil',
    photo_upload_button: 'Subir',
    photo_upload_success: 'Foto actualizada.',
    photo_upload_error: 'No se pudo subir la foto.',
    notifications_title: 'Notificaciones',
    notifications_desc: 'Activa notificaciones para invitaciones y cambios.',
    notifications_enable: 'Activar notificaciones',
    notifications_disable: 'Desactivar notificaciones',
    notifications_enabled: 'Notificaciones activadas.',
    notifications_disabled: 'Notificaciones desactivadas.',
    notifications_blocked: 'Notificaciones bloqueadas en el navegador.',
    notifications_missing_key: 'Falta la clave VAPID.',
    notifications_error: 'No se pudieron actualizar las notificaciones.',
    verification_title: 'Verificacion de foto',
    verification_desc: 'Sube un selfie con la frase de verificacion.',
    verification_phrase_label: 'Frase de verificacion',
    verification_phrase: 'LBS2025',
    verification_upload_label: 'Foto de verificacion',
    verification_submit: 'Enviar verificacion',
    verification_submitting: 'Enviando...',
    verification_status_pending: 'Verificacion enviada para revision.',
    verification_status_success: 'Verificacion actualizada.',
    verification_status_error: 'No se pudo enviar la verificacion.',
    verification_admin_title: 'Verificacion de foto',
    verification_admin_desc: 'Revisa los selfies de verificacion.',
    verification_admin_empty: 'Sin solicitudes.',
    verification_admin_approve: 'Aprobar',
    verification_admin_reject: 'Rechazar',
    events_page_title: 'Fiestas y eventos',
    events_page_desc: 'Eventos próximos, cupos y estado de aprobación.',
    event_privacy_label: 'Privacidad',
    event_privacy_public: 'Público',
    event_privacy_vetted: 'Verificado',
    event_privacy_private: 'Privado',
    event_privacy_notice_public: 'Visible para todos. Dirección compartida.',
    event_privacy_notice_vetted: 'Visible para todos. Dirección tras aprobación.',
    event_privacy_notice_private: 'Solo con invitación. No listado.',
    event_address_label: 'Ubicación',
    event_address_hidden: 'Dirección oculta hasta aprobación.',
    event_cap_label: 'Cupo',
    event_cap_men: 'Hombres',
    event_cap_women: 'Mujeres',
    event_cap_couples: 'Parejas',
    event_rsvp_title: 'RSVP',
    event_rsvp_desc: 'Elige una categoría para solicitar cupo.',
    event_rsvp_category_label: 'Categoría',
    event_rsvp_submit: 'Enviar RSVP',
    event_rsvp_sending: 'Enviando...',
    event_rsvp_full: 'Categoría llena.',
    event_rsvp_pending: 'RSVP pendiente.',
    event_rsvp_approved: 'RSVP aprobado.',
    event_rsvp_declined: 'RSVP rechazado.',
    event_rsvp_error: 'No se pudo enviar RSVP.',
    event_rsvp_signed_out: 'Inicia sesión para RSVP.',
    event_rsvp_qr_title: 'QR de entrada',
    event_rsvp_qr_desc: 'Muestra el código en la puerta.',
    event_guest_manager_title: 'Gestor de invitados',
    event_guest_manager_desc: 'Revisa RSVPs y badges de confianza.',
    event_guest_manager_pending: 'Solicitudes pendientes',
    event_guest_manager_approved: 'Invitados aprobados',
    event_guest_manager_empty: 'Sin RSVPs.',
    event_guest_action_approve: 'Aprobar',
    event_guest_action_decline: 'Rechazar',
    event_not_found_title: 'Evento no encontrado',
    event_not_found_body: 'No pudimos encontrar este evento.',
    event_back: 'Volver a eventos',
    event_live_status_label: 'Estado en vivo',
    event_live_status_open: 'Abierto',
    event_live_status_full: 'Lleno',
    event_live_status_last_call: 'Ultimo llamado',
    event_live_update: 'Actualizar estado',
    event_live_chat_title: 'Chat en vivo',
    event_live_chat_placeholder: 'Escribe un mensaje...',
    event_live_chat_send: 'Enviar',
    host_dashboard_title: 'Panel de anfitrión',
    host_dashboard_desc: 'Sigue los RSVPs de tus eventos.',
    host_dashboard_empty: 'Sin eventos como anfitrión.',
    host_dashboard_signin: 'Inicia sesión para ver herramientas.',
    footer_tagline: 'Hogar de la comunidad para usuarios, constelaciones, clubes e historias.',
    footer_guidelines: 'Guías y términos',
    lang_select_label: 'Seleccionar idioma',
    hero_pill: 'Para creadores, clubes e historias compartidas',
    hero_title: 'Crea una red viva de personas, clubes y noches inolvidables.',
    hero_lead:
      'LedBySwing conecta personas, constelaciones y clubes para historias, reseñas y diarios de viaje.',
    hero_paragraph:
      'Welcome to the next evolution of ethical non-monogamy. LedBySwing is a community-built platform designed for the way we actually live. Whether you are a solo explorer, part of an established couple, or a member of a complex constellation, we provide the tools to connect, organize, and thrive. No paywalls, no hidden fees—just an open, adult space dedicated to authentic connection and unforgettable events.',
    relationships_title: 'Your Relationships Are Unique. Your Platform Should Be Too.',
    relationships_body:
      'Traditional sites stop at "Single" or "Couple." We go further. From managing intricate polycules to hosting private events, LedBySwing is designed to handle the beautiful complexity of modern ethical non-monogamy. Bring your constellation home.',
    hero_cta_primary: 'Lanzar una constelación',
    hero_cta_secondary: 'Explorar la red',
    metric_label: 'Usuarios activos',
    metric_caption: 'Creciendo en 12 regiones',
    register_page_title: 'Crea tu cuenta',
    register_page_subtitle:
      'Esto crea una cuenta individual. Las parejas o constelaciones se pueden añadir más adelante.',
    auth_title: 'Crea tu cuenta',
    auth_subtitle:
      'Los perfiles desbloquean reseñas, calendarios privados e invitaciones.',
    register_kicker: 'Acceso privado a la comunidad',
    register_heading: 'Construye un perfil con intención.',
    register_body:
      'Cada cuenta se revisa. Puedes navegar anónimamente, pero las reseñas requieren perfil.',
    label_display_name: 'Nombre visible',
    label_email: 'Email',
    label_password: 'Contraseña',
    label_confirm_password: 'Confirmar contraseña',
    label_birth_date: 'Fecha de nacimiento',
    label_location: 'Ubicación',
    label_location_lat: 'Latitud',
    label_location_lng: 'Longitud',
    label_interests: 'Intereses',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ caracteres',
    placeholder_confirm_password: 'Repite la contraseña',
    placeholder_birth_date: 'AAAA-MM-DD',
    placeholder_location: 'Ciudad, país',
    placeholder_location_lat: '40.41',
    placeholder_location_lng: '-3.70',
    placeholder_interests: 'Relaciones abiertas, Voyeur, BDSM',
    interest_tag_1: 'Relaciones abiertas',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Eventos sociales',
    consent_age: 'I confirm I am 18+ (or the legal age of majority in my jurisdiction).',
    consent_privacy: 'Mantener mi perfil privado hasta publicarlo.',
    consent_policy_prefix: 'I have read and agree to the ',
    consent_policy_link: 'Terms of Service and Community Guidelines',
    consent_policy_suffix: '.',
    register_create: 'Crear cuenta',
    register_creating: 'Creando...',
    register_google_cta: 'Crear cuenta con Google',
    register_google_hint:
      'Usa Google para evitar la contraseña. Completamos el correo electrónico.',
    auth_sign_in_google: 'Iniciar sesión con Google',
    auth_sign_out: 'Cerrar sesión',
    auth_status_setup: 'Se requiere configuración de acceso',
    auth_status_config: 'Se requiere configuración de acceso',
    auth_status_pending: 'Las nuevas cuentas se revisan antes de publicarse',
    auth_sign_in_missing: 'Enter your email and password to sign in.',
    auth_sign_in_success: 'Signed in.',
    auth_sign_in_error: 'Unable to sign in. Please try again.',
    register_password_mismatch: 'Las contraseñas no coinciden.',
    register_underage: 'Debes tener al menos 18 años.',
    register_status_success: 'Cuenta creada. Pendiente de revisión.',
    register_status_permission:
      'Cuenta creada, pero el perfil está bloqueado por reglas Firestore.',
    register_status_error: 'No se pudo crear la cuenta.',
    register_expect_label: 'Espera',
    register_expect_text: 'Moderación cuidada y perfiles verificados.',
    register_privacy_label: 'Privacidad',
    register_privacy_text: 'Elige qué mostrar antes de publicar.',
    register_trust_label: 'Confianza',
    register_trust_text: 'Las reseñas se asocian a perfiles reales.',
    register_have_account: '¿Ya tienes cuenta?',
    register_sign_in: 'Iniciar sesión',
    guidelines_page_title: 'Guidelines & Terms',
    guidelines_page_subtitle: 'Please read these policies before joining or hosting events.',
    terms_title: 'Terms of Service (The Legal Guardrails)',
    terms_eligibility_title: 'Eligibility & Age Verification',
    terms_eligibility_item_1:
      '18+ requirement: You must be at least 18 years old (or the legal age of majority in your jurisdiction) to access this site.',
    terms_eligibility_item_2:
      'Verification: We may require age assurance or ID matching to prevent underage access, especially before allowing participation in events.',
    terms_content_title: 'Content Ownership & License',
    terms_content_item_1: 'Your content: You retain ownership of the photos and text you upload.',
    terms_content_item_2:
      'Our license: By posting content, you grant us a non-exclusive, royalty-free license to host and display it for the purpose of operating the service.',
    terms_content_item_3:
      'Copyright (DMCA): We respect intellectual property. If you believe your work has been copied, use our designated takedown process.',
    terms_prohibited_title: 'Prohibited Content & Illegal Acts',
    terms_prohibited_item_1:
      'Zero tolerance: We strictly prohibit facilitation of sex trafficking (FOSTA-SESTA compliance) or any non-consensual sexual content.',
    terms_prohibited_item_2:
      'Illegal acts: Using the platform to promote illegal drugs, violence, or harm is grounds for immediate termination.',
    terms_liability_title: 'Limitation of Liability',
    terms_liability_item_1:
      'As-is service: LedBySwing is provided as-is without warranties of uptime or performance.',
    terms_liability_item_2:
      'Social interaction: We are not responsible for the behavior of users at offline events organized through the site.',
    guidelines_title: 'Community Guidelines (The Vibe & Ethics)',
    guidelines_core_title: 'The C.O.R.E. Principles',
    guidelines_core_item_1:
      'Consent: Verbal, active, and enthusiastic consent is mandatory for all interactions, both digital and physical.',
    guidelines_core_item_2:
      'Openness: We are an inclusive space. We welcome all genders, orientations, and relationship structures (monogamous-ish to complex polycules).',
    guidelines_core_item_3:
      'Respect: Treat others with dignity. Harassment, hunting, or aggressive behavior is not tolerated.',
    guidelines_core_item_4:
      'Ethics: We value transparency. Always be honest about your relationship status and the boundaries of your constellation.',
    guidelines_constellation_title: 'Constellation Etiquette',
    guidelines_constellation_item_1:
      'Linked profiles: When linking accounts into a constellation, ensure all parties have consented to being displayed together.',
    guidelines_constellation_item_2:
      "Privacy: Never share another member's real-world identity or private photos without explicit permission.",
    guidelines_event_title: 'Event Safety',
    guidelines_event_item_1:
      'Host rights: Event organizers have the right to set their own vetting requirements (e.g., ID checks or references) for private gatherings.',
    guidelines_event_item_2:
      'Reporting: If you witness unsafe behavior at an event or on the site, use our Flag tool. We prioritize reports involving non-consensual behavior.',
    users_title: 'Usuarios',
    users_subtitle: 'Perfiles, roles y actividad compartida alimentan constelaciones.',
    users_card_profiles_title: 'Perfiles',
    users_card_profiles_body: 'Perfiles con roles, pronombres e intereses.',
    users_card_profiles_item1: 'Etiquetas personalizadas',
    users_card_profiles_item2: 'Estado de disponibilidad',
    users_card_profiles_item3: 'Intereses compartidos',
    users_card_trust_title: 'Confianza comunitaria',
    users_card_trust_body: 'El impulso crece cuando se comparten historias.',
    users_card_trust_item1: 'Recomendaciones',
    users_card_trust_item2: 'Asistencia a eventos',
    users_card_trust_item3: 'Impacto de historias',
    users_card_privacy_title: 'Opciones de privacidad',
    users_card_privacy_body: 'Elige tu visibilidad en clubes y constelaciones.',
    users_card_privacy_item1: 'Visibilidad por club',
    users_card_privacy_item2: 'Control de historias',
    users_card_privacy_item3: 'Ocultar actividad',
    const_title: 'Constelaciones',
    const_subtitle: 'Cada constelación reúne dos o más usuarios.',
    const_card_title: 'Clusters colaborativos',
    const_card_body:
      'Crea constelaciones para mentoría, co‑creación o lanzamientos.',
    const_tag1: '2+ usuarios',
    const_tag2: 'Misión compartida',
    const_tag3: 'Tiempo limitado',
    clubs_title: 'Clubes',
    clubs_subtitle: 'Espacios independientes con eventos y publicaciones.',
    clubs_card1_title: 'Rutas de membresía',
    clubs_card1_body: 'Accesos por niveles para invitados, miembros y embajadores.',
    clubs_card1_item1: 'Entradas por invitación',
    clubs_card1_item2: 'Check-in de eventos',
    clubs_card1_item3: 'Mapas de retención',
    clubs_card2_title: 'Espacios de club',
    clubs_card2_body: 'Sitios de clubes con calendarios, galerías y posts.',
    clubs_card2_item1: 'Multi-admin',
    clubs_card2_item2: 'Temas predefinidos',
    clubs_card2_item3: 'Publicación rápida',
    clubs_card3_title: 'Crecimiento compartido',
    clubs_card3_body: 'Mira qué crece de cada club.',
    clubs_card3_item1: 'Atribución de historias',
    clubs_card3_item2: 'Conexiones de club',
    clubs_card3_item3: 'Cohortes de crecimiento',
    clubs_highlights_title: 'Clubs destacados',
    clubs_highlights_body: 'Clubs recomendados para empezar.',
    clubs_loading: 'Cargando...',
    map_title: 'Mapa de clubes de Europa',
    map_desc: 'Ver dónde se reúne la comunidad en Europa.',
    map_aria: 'OpenStreetMap de Europa',
    map_pin_open: 'Abrir {name}',
    websites_title: 'Sitios',
    websites_desc: 'Lanza sitios de marca con perfiles e historias.',
    websites_card1_title: 'Páginas vivas',
    websites_card1_body: 'Destaca calendarios, equipos y constelaciones.',
    websites_card1_item1: 'Plantillas adaptativas',
    websites_card1_item2: 'Texto multilingüe',
    websites_card1_item3: 'Amigable con SEO',
    websites_card2_title: 'Visibilidad',
    websites_card2_body: 'Muestra clubes y mantiene historias visibles.',
    websites_card2_item1: 'Calendarios compartidos',
    websites_card2_item2: 'Archivo de historias',
    websites_card2_item3: 'Destacados comunitarios',
    websites_card3_title: 'Gestión',
    websites_card3_body: 'Alinea aprobación y publicación.',
    websites_card3_item1: 'Flujos editoriales',
    websites_card3_item2: 'Roles de miembros',
    websites_card3_item3: 'Historial de edición',
    website_visit: 'Visitar sitio',
    blog_title: 'Entradas del blog',
    blog_desc: 'Historias ligadas a usuarios, constelaciones y viajes.',
    blog_loading: 'Cargando archivo...',
    moderation_title: 'Cola de revisión',
    moderation_desc: 'Nuevos perfiles y reseñas esperan revisión.',
    moderation_pending_label: 'Reseñas pendientes',
    moderation_pending_desc: 'Aprueba o rechaza antes de publicar.',
    moderation_queue_label: 'Cola',
    moderation_queue_empty: 'No hay reseñas en la cola.',
    moderation_admin_only_title: 'Solo admins',
    moderation_admin_only_desc: 'Inicia sesión como admin para moderar.',
    moderation_open_admin: 'Abrir panel admin',
    admin_title: 'Panel admin',
    admin_subtitle: 'Modera reseñas y publica con confianza.',
    admin_access_denied_title: 'Acceso denegado',
    admin_access_denied_body: 'Necesitas una cuenta admin.',
    admin_back_home: 'Volver al inicio',
    admin_pending_title: 'Reseñas pendientes',
    admin_pending_desc: 'Reseñas esperando decisión.',
    admin_approved_title: 'Reseñas aprobadas',
    admin_approved_desc: 'Reseñas publicadas recientemente.',
    admin_queue_title: 'Cola de moderación',
    admin_action_approve: 'Aprobar',
    admin_action_reject: 'Rechazar',
    admin_no_pending: 'No hay reseñas pendientes.',
    admin_recent_title: 'Aprobadas recientemente',
    admin_recent_empty: 'No hay reseñas aprobadas.',
    admin_events_title: 'Moderacion de eventos',
    admin_events_desc: 'Revisa las RSVP pendientes de todos los eventos.',
    admin_events_empty: 'No hay RSVP de eventos pendientes.',
    clubs_page_title: 'Clubes',
    clubs_page_desc: 'Explora clubes y abre los detalles.',
    club_submit_title: 'Enviar un club',
    club_submit_desc:
      '¿Conoces un club que deberíamos añadir? Envía los detalles para revisión.',
    club_submit_name_label: 'Nombre del club',
    club_submit_city_label: 'Ciudad',
    club_submit_country_label: 'País',
    club_submit_website_label: 'Sitio',
    club_submit_summary_label: 'Descripción corta',
    club_submit_summary_placeholder: 'Cuenta qué hace especial a este club...',
    club_submit_submit: 'Enviar club',
    club_submit_submitting: 'Enviando...',
    club_submit_signin_required: 'Inicia sesión para enviar un club.',
    club_submit_status_pending: 'Club enviado para moderación.',
    club_submit_status_error: 'No se pudo enviar el club.',
    club_submit_permission_error:
      'Envío de club bloqueado por reglas Firestore.',
    city_breadcrumb_home: 'Inicio',
    city_breadcrumb_clubs: 'Clubes',
    city_title_desc: 'Clubes y constelaciones en esta ciudad.',
    city_fallback: 'Esta ciudad',
    city_clubs_title: 'Clubes',
    city_constellations_title: 'Constelaciones',
    city_clubs_empty: 'No hay clubes aún.',
    city_constellations_empty: 'No hay constelaciones aún.',
    club_not_found_title: 'Club no encontrado',
    club_not_found_body: 'No pudimos encontrar ese club.',
    club_back: 'Volver a clubes',
    club_description: 'Descripción',
    club_info: 'Información útil',
    club_city: 'Ciudad',
    club_country: 'País',
    club_date_visited: 'Fecha de visita',
    club_dress_code: 'Dress code',
    club_party_type: 'Tipo de fiesta',
    club_day_of_week: 'Día de la semana',
    club_website: 'Sitio',
    club_visit_site: 'Visitar',
    reviews_title: 'Reseñas',
    reviews_desc: 'Reseñas completas y notas de la comunidad.',
    reviews_club_title: 'Reseñas del club',
    reviews_club_desc: 'Las reseñas se muestran tras la moderación.',
    reviews_none: 'No hay reseñas publicadas.',
    review_rating_label: 'Calificación',
    review_text_label: 'Reseña',
    review_text_placeholder: 'Comparte tu experiencia con este club...',
    review_submit: 'Enviar para revisión',
    review_submitting: 'Enviando...',
    review_signin_required: 'Inicia sesión para enviar una reseña.',
    review_status_pending: 'Reseña enviada para moderación.',
    review_status_error: 'No se pudo enviar la reseña.',
    review_permission_error: 'Reseña bloqueada por reglas Firestore.',
    review_author_anonymous: 'anónimo',
    review_rating_status: 'Calificación: {rating}/5 · Estado: {status}',
    review_identity_label: 'Publicar como',
    review_identity_profile: 'Tu perfil',
    review_identity_anonymous: 'Anónimo',
    status_pending: 'Pendiente',
    status_approved: 'Aprobada',
    status_rejected: 'Rechazada',
    status_published: 'Publicada',
    rating_option_5: '5 - Excelente',
    rating_option_4: '4 - Muy bien',
    rating_option_3: '3 - Correcto',
    rating_option_2: '2 - A mejorar',
    rating_option_1: '1 - Malo',
    map_page_title: 'Mapa de clubes de Europa',
    map_page_desc: 'Vista de depuración del mapa de clubes.',
  },
} as const

const getCopy = (lang: Lang) => copy[lang] ?? copy.en

const getLocalizedText = (value: LocalizedText | string, lang: Lang) => {
  if (typeof value === 'string') {
    return value
  }
  return value[lang] ?? value.en ?? ''
}

const getLocalizedList = (
  values: Array<LocalizedText | string>,
  lang: Lang
) => values.map((value) => getLocalizedText(value, lang))

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

const fuzzCoordinate = (value: number, precision = 2) => {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

const cropImageToSquare = (file: File) =>
  new Promise<{ file: File; previewUrl: string }>((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      const size = Math.min(image.width, image.height)
      const offsetX = (image.width - size) / 2
      const offsetY = (image.height - size) / 2
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Canvas context unavailable.'))
        return
      }
      context.drawImage(image, offsetX, offsetY, size, size, 0, 0, size, size)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            URL.revokeObjectURL(objectUrl)
            reject(new Error('Unable to encode image.'))
            return
          }
          const croppedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
          })
          const previewUrl = URL.createObjectURL(blob)
          URL.revokeObjectURL(objectUrl)
          resolve({ file: croppedFile, previewUrl })
        },
        'image/jpeg',
        0.92
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Unable to load image.'))
    }
    image.src = objectUrl
  })

const generateCheckinToken = () => {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes)
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  }
  return Math.random().toString(16).slice(2)
}

const buildQrMatrix = (token: string, size = 21) => {
  let seed = 0
  for (let index = 0; index < token.length; index += 1) {
    seed = (seed * 31 + token.charCodeAt(index)) >>> 0
  }
  const next = () => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return seed >>> 0
  }
  const matrix: boolean[][] = []
  for (let row = 0; row < size; row += 1) {
    const rowData: boolean[] = []
    for (let col = 0; col < size; col += 1) {
      rowData.push((next() + row + col) % 3 === 0)
    }
    matrix.push(rowData)
  }
  return matrix
}

const QrToken = ({ token }: { token: string }) => {
  const matrix = useMemo(() => buildQrMatrix(token), [token])
  const cellSize = 4
  const viewSize = matrix.length * cellSize

  return (
    <svg
      className="qr-grid"
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      aria-label={token}
      role="img"
    >
      <rect width={viewSize} height={viewSize} fill="var(--surface)" rx="6" />
      {matrix.map((row, rowIndex) =>
        row.map((isFilled, colIndex) =>
          isFilled ? (
            <rect
              key={`${rowIndex}-${colIndex}`}
              x={colIndex * cellSize}
              y={rowIndex * cellSize}
              width={cellSize}
              height={cellSize}
              fill="var(--ink)"
            />
          ) : null
        )
      )}
    </svg>
  )
}

const getStatusLabel = (status: string, translation: typeof copy.en) => {
  const normalized = status.toLowerCase()
  if (normalized === 'approved') {
    return translation.status_approved
  }
  if (normalized === 'rejected') {
    return translation.status_rejected
  }
  if (normalized === 'published') {
    return translation.status_published
  }
  if (normalized === 'pending') {
    return translation.status_pending
  }
  return status
}

const useAppContext = () => useOutletContext<AppContext>()

const ConstellationGraph = ({
  constellation,
  profiles,
  lang,
}: {
  constellation: Constellation
  profiles: Profile[]
  lang: Lang
}) => {
  const members = (constellation.members ?? [])
    .map((slug) => profiles.find((profile) => profile.slug === slug))
    .filter(Boolean) as Profile[]
  const links = (constellation.links ?? []).filter(
    (link) =>
      members.some((profile) => profile.slug === link.user_a) &&
      members.some((profile) => profile.slug === link.user_b)
  )

  const width = 260
  const height = 190
  const nodeSize = 44
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.min(centerX, centerY) - nodeSize
  const angleOffset = -Math.PI / 2
  const count = Math.max(members.length, 1)
  const angleStep = (Math.PI * 2) / count

  const positions = members.map((profile, index) => {
    if (members.length === 1) {
      return {
        profile,
        x: centerX,
        y: centerY,
      }
    }
    const angle = angleOffset + angleStep * index
    return {
      profile,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    }
  })

  const nodeLookup = positions.reduce<Record<string, { x: number; y: number }>>(
    (acc, node) => {
      acc[node.profile.slug] = { x: node.x, y: node.y }
      return acc
    },
    {}
  )

  return (
    <div className="constellation-graph" aria-label={constellation.name}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="presentation"
        aria-hidden="true"
      >
        {links.map((link) => {
          const source = nodeLookup[link.user_a]
          const target = nodeLookup[link.user_b]
          if (!source || !target) {
            return null
          }
          const typeClass = `constellation-link--${slugify(link.link_type)}`
          const statusClass =
            link.status === 'Pending' ? 'constellation-link--pending' : ''
          return (
            <line
              key={`${link.user_a}-${link.user_b}-${link.link_type}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              className={`constellation-link ${typeClass} ${statusClass}`}
            />
          )
        })}
      </svg>
      {positions.map(({ profile, x, y }) => (
        <Link
          key={profile.slug}
          to={`/${lang}/profiles/${profile.slug}`}
          className="constellation-node"
          style={{
            left: `${x - nodeSize / 2}px`,
            top: `${y - nodeSize / 2}px`,
          }}
          aria-label={profile.display_name}
          title={profile.display_name}
        >
          {profile.photo_url ? (
            <img
              src={profile.photo_url}
              alt={profile.display_name}
              loading="lazy"
            />
          ) : (
            <span className="constellation-node-initials">
              {getInitials(profile.display_name)}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}

const SiteLayout = ({ context }: { context: AppContext }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const lang = getLangFromPath(location.pathname)
  const [langValue, setLangValue] = useState(lang)
  const copy = getCopy(lang)
  const { isAdmin, authUser, handleAuthClick } = context
  const registerState = {
    from: `${location.pathname}${location.search}${location.hash}`,
  }

  useEffect(() => {
    setLangValue(lang)
  }, [lang])

  const handleLanguageChange = (value: string) => {
    const rest = location.pathname.replace(/^\/(en|pl|fr|de|it|es)/, '') || '/'
    navigate(`/${value}${rest}`)
  }

  return (
    <div>
      <div className="ambient"></div>
      <header className="site-header">
        <Link to={`/${lang}`} className="brand">
          <div className="logo-container">
            <svg
              width="40"
              height="40"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M20 80 C 20 50, 50 50, 50 20"
                stroke="url(#grad1)"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <path
                d="M50 80 C 50 65, 80 65, 80 50"
                stroke="url(#grad1)"
                strokeWidth="8"
                strokeLinecap="round"
                opacity="0.7"
              />
              <circle cx="20" cy="80" r="12" fill="var(--logo-primary)" />
              <circle cx="50" cy="20" r="12" fill="var(--logo-secondary)" />
              <circle cx="80" cy="50" r="12" fill="var(--logo-primary)" />
              <defs>
                <linearGradient id="grad1" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--logo-primary)" stopOpacity="1" />
                  <stop offset="100%" stopColor="var(--logo-secondary)" stopOpacity="1" />
                </linearGradient>
              </defs>
            </svg>
            <div className="logo-text">
              LedBy<span className="highlight">Swing</span>
            </div>
          </div>
          <div>
            <h1>{copy.site_tagline}</h1>
          </div>
        </Link>
        <nav className="nav">
          <a href={`/${lang}#constellations`}>{copy.nav_constellations}</a>
          <Link to={`/${lang}/clubs`}>{copy.nav_clubs}</Link>
          <Link to={`/${lang}/events`}>{copy.nav_events}</Link>
          <a href={`/${lang}#map`}>{copy.nav_map}</a>
          <Link to={`/${lang}/blog`}>{copy.nav_blog}</Link>
          {!authUser ? (
            <Link to={`/${lang}/register`} state={registerState}>
              {copy.nav_join}
            </Link>
          ) : null}
          {isAdmin ? (
            <Link to={`/${lang}/admin`}>{copy.nav_admin}</Link>
          ) : null}
          <select
            className="lang-select"
            value={langValue}
            onChange={(event) => handleLanguageChange(event.target.value)}
            aria-label={copy.lang_select_label}
          >
            <option value="en">EN</option>
            <option value="pl">PL</option>
            <option value="fr">FR</option>
            <option value="de">DE</option>
            <option value="it">IT</option>
            <option value="es">ES</option>
          </select>
          {!authUser ? (
            <Link className="cta" to={`/${lang}/register`} state={registerState}>
              {copy.request_access}
            </Link>
          ) : (
            <details className="user-menu">
              <summary className="user-button" aria-label={copy.user_menu_label}>
                <span className="user-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path
                      d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12zm0 2.3c-3.1 0-9.1 1.6-9.1 4.7V22h18.2v-3c0-3.1-6-4.7-9.1-4.7z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <span className="user-name">{authUser}</span>
              </summary>
              <div className="user-dropdown">
                <Link to={`/${lang}/profile`}>{copy.user_menu_edit}</Link>
                <Link to={`/${lang}/events/host`}>{copy.user_menu_host}</Link>
                <button type="button" onClick={handleAuthClick}>
                  {copy.user_menu_signout}
                </button>
              </div>
            </details>
          )}
        </nav>
      </header>

      <main>
        <Outlet context={context} />
      </main>

      <footer className="site-footer">
        <div>
          <h3>LedBySwing</h3>
          <p>{copy.footer_tagline}</p>
        </div>
        <div className="footer-actions">
          <Link className="ghost" to={`/${lang}/guidelines`}>
            {copy.footer_guidelines}
          </Link>
        </div>
      </footer>
    </div>
  )
}

const HomePage = () => {
  const {
    clubs,
    constellations,
    profiles,
    posts,
    pendingReviews,
    isAdmin,
    firebaseConfigured,
  } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const registerState = {
    from: `${location.pathname}${location.search}${location.hash}`,
  }
  const registerState = {
    from: `${location.pathname}${location.search}${location.hash}`,
  }
  const highlightClubs = useMemo(() => {
    if (!clubs.length) {
      return []
    }
    const shuffled = [...clubs]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      ;[shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ]
    }
    return shuffled.slice(0, 10)
  }, [clubs])

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="pill">{copy.hero_pill}</p>
          <h2>{copy.hero_title}</h2>
          <p className="lead">
            {copy.hero_lead}
          </p>
          <p className="lead">{copy.hero_paragraph}</p>
          <div className="hero-actions">
            <Link className="cta" to={`/${lang}/register`} state={registerState}>
              {copy.hero_cta_primary}
            </Link>
            <button className="ghost">{copy.hero_cta_secondary}</button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="orbital" aria-hidden="true">
            <div className="orb"></div>
            <div className="orb"></div>
            <div className="orb"></div>
            <div className="orb"></div>
          </div>
          <div className="metric">
            <p className="metric-label">{copy.metric_label}</p>
            <p className="metric-caption">{copy.metric_caption}</p>
          </div>
        </div>
      </section>

      <section className="grid" id="users">
        <div className="section-title">
          <h3>{copy.users_title}</h3>
          <p>{copy.users_subtitle}</p>
        </div>
        <div className="cards">
          <article className="card reveal">
            <h4>{copy.users_card_profiles_title}</h4>
            <p>{copy.users_card_profiles_body}</p>
            <ul>
              <li>{copy.users_card_profiles_item1}</li>
              <li>{copy.users_card_profiles_item2}</li>
              <li>{copy.users_card_profiles_item3}</li>
            </ul>
          </article>
          <article className="card reveal">
            <h4>{copy.users_card_trust_title}</h4>
            <p>{copy.users_card_trust_body}</p>
            <ul>
              <li>{copy.users_card_trust_item1}</li>
              <li>{copy.users_card_trust_item2}</li>
              <li>{copy.users_card_trust_item3}</li>
            </ul>
          </article>
          <article className="card reveal">
            <h4>{copy.users_card_privacy_title}</h4>
            <p>{copy.users_card_privacy_body}</p>
            <ul>
              <li>{copy.users_card_privacy_item1}</li>
              <li>{copy.users_card_privacy_item2}</li>
              <li>{copy.users_card_privacy_item3}</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="feature" id="constellations">
        <div className="section-title">
          <h3>{copy.const_title}</h3>
          <p>{copy.const_subtitle}</p>
        </div>
        <div className="constellation-wrap reveal">
          {constellations.length && profiles.length ? (
            <ConstellationGraph
              constellation={constellations[0]}
              profiles={profiles}
              lang={lang}
            />
          ) : (
            <div className="constellation-empty">{copy.clubs_loading}</div>
          )}
          <div className="constellation-copy">
            <h4>{copy.const_card_title}</h4>
            <p>
              {copy.const_card_body}
            </p>
            <div className="tag-row">
              <span>{copy.const_tag1}</span>
              <span>{copy.const_tag2}</span>
              <span>{copy.const_tag3}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid" id="clubs">
        <div className="section-title">
          <h3>{copy.clubs_title}</h3>
          <p>{copy.clubs_subtitle}</p>
        </div>
        <div className="cards">
          <article className="card reveal">
            <h4>{copy.clubs_card1_title}</h4>
            <p>{copy.clubs_card1_body}</p>
            <ul>
              <li>{copy.clubs_card1_item1}</li>
              <li>{copy.clubs_card1_item2}</li>
              <li>{copy.clubs_card1_item3}</li>
            </ul>
          </article>
          <article className="card reveal">
            <h4>{copy.clubs_card2_title}</h4>
            <p>{copy.clubs_card2_body}</p>
            <ul>
              <li>{copy.clubs_card2_item1}</li>
              <li>{copy.clubs_card2_item2}</li>
              <li>{copy.clubs_card2_item3}</li>
            </ul>
          </article>
          <article className="card reveal">
            <h4>{copy.clubs_card3_title}</h4>
            <p>{copy.clubs_card3_body}</p>
            <ul>
              <li>{copy.clubs_card3_item1}</li>
              <li>{copy.clubs_card3_item2}</li>
              <li>{copy.clubs_card3_item3}</li>
            </ul>
          </article>
        </div>
        <div className="legacy-strip reveal">
          <div>
            <h4>{copy.clubs_highlights_title}</h4>
            <p>{copy.clubs_highlights_body}</p>
          </div>
          <div className="legacy-tags">
            {highlightClubs.length ? (
              highlightClubs.map((club) => (
                <span key={club.slug}>{club.name}</span>
              ))
            ) : (
              <span>{copy.clubs_loading}</span>
            )}
          </div>
        </div>
        <div className="club-grid">
          {clubs.map((club) => (
            <article className="data-card reveal" key={club.slug}>
              <h5>
                <Link to={`/${lang}/clubs/${club.slug}`}>{club.name}</Link>
              </h5>
              <p>{getLocalizedText(club.summary, lang)}</p>
              <div className="meta-row">
                <span>
                  {club.city ? `${club.city}, ` : ''}
                  {club.country}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <EuropeMapSection
        id="map"
        title={copy.map_title}
        description={copy.map_desc}
      />

      <section className="feature" id="blog">
        <div className="section-title">
          <h3>{copy.blog_title}</h3>
          <p>{copy.blog_desc}</p>
        </div>
        <div className="blog-grid">
          {posts.length ? (
            posts.map((post) => {
              const meta = getLocalizedList(post.meta, lang)
              const postDate = getLocalizedText(post.date, lang)
              const postTitle = getLocalizedText(post.title, lang)
              const postUrl = getLocalizedText(post.url, lang)
              const postKey = `${getLocalizedText(post.title, 'en')}-${getLocalizedText(
                post.date,
                'en'
              )}`
              return (
                <a
                  className="post reveal"
                  href={postUrl}
                  target="_blank"
                  rel="noreferrer"
                  key={postKey}
                >
                  <p className="post-date">{postDate}</p>
                  <h4>{postTitle}</h4>
                  <p>{getLocalizedText(post.excerpt, lang)}</p>
                  <div className="post-meta">
                    <span>{meta[0]}</span>
                    <span>{meta[1]}</span>
                  </div>
                </a>
              )
            })
          ) : (
            <p className="muted">{copy.blog_loading}</p>
          )}
        </div>
      </section>

      <section className="feature" id="relationships">
        <div className="section-title">
          <h3>{copy.relationships_title}</h3>
          <p>{copy.relationships_body}</p>
        </div>
      </section>
    </>
  )
}

type MapSectionProps = {
  id?: string
  title: string
  description: string
}

const EuropeMapSection = ({ id, title, description }: MapSectionProps) => {
  const { clubs } = useAppContext()
  const location = useLocation()
  const navigate = useNavigate()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) {
      return
    }
    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView([50.5, 12], 4)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
      attribution:
        '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(map)

    const markers = L.layerGroup().addTo(map)
    mapInstanceRef.current = map
    markersRef.current = markers

    return () => {
      map.remove()
      mapInstanceRef.current = null
      markersRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!markersRef.current) {
      return
    }
    markersRef.current.clearLayers()
    clubs
      .filter((club) => club.lat !== undefined && club.lng !== undefined)
      .forEach((club) => {
        const marker = L.circleMarker([club.lat as number, club.lng as number], {
          radius: 6,
          color: '#f26430',
          weight: 2,
          fillColor: '#f26430',
          fillOpacity: 0.8,
        })
        marker.bindTooltip(club.name, {
          direction: 'top',
          offset: [0, -8],
          opacity: 0.95,
        })
        marker.on('click', () => {
          navigate(`/${lang}/cities/${slugify(club.city || club.name)}`)
        })
        markersRef.current?.addLayer(marker)
      })
  }, [clubs, lang, navigate])
  return (
    <section className="feature" id={id}>
      <div className="section-title">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="map-card reveal">
        <div className="osm-map" ref={mapRef} aria-label={copy.map_aria} />
      </div>
    </section>
  )
}

const MapPage = () => {
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  return (
    <EuropeMapSection
      title={copy.map_page_title}
      description={copy.map_page_desc}
    />
  )
}

const BlogPage = () => {
  const { posts } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)

  return (
    <section className="feature">
      <div className="section-title">
        <h3>{copy.blog_title}</h3>
        <p>{copy.blog_desc}</p>
      </div>
      <div className="blog-grid">
        {posts.length ? (
          posts.map((post) => {
            const meta = getLocalizedList(post.meta, lang)
            const postDate = getLocalizedText(post.date, lang)
            const postTitle = getLocalizedText(post.title, lang)
            const postUrl = getLocalizedText(post.url, lang)
            const postKey = `${getLocalizedText(post.title, 'en')}-${getLocalizedText(
              post.date,
              'en'
            )}`
            return (
              <a
                className="post reveal"
                href={postUrl}
                target="_blank"
                rel="noreferrer"
                key={postKey}
              >
                <p className="post-date">{postDate}</p>
                <h4>{postTitle}</h4>
                <p>{getLocalizedText(post.excerpt, lang)}</p>
                <div className="post-meta">
                  <span>{meta[0]}</span>
                  <span>{meta[1]}</span>
                </div>
              </a>
            )
          })
        ) : (
          <p className="muted">{copy.blog_loading}</p>
        )}
      </div>
    </section>
  )
}

const RegisterPage = () => {
  const {
    authStatus,
    authUser,
    handleAuthClick,
    handleEmailSignIn,
    handleGoogleRegisterStart,
    handleRegister,
    handleGoogleRegister,
    registerStatus,
    signInStatus,
    registerLoading,
    signInLoading,
    firebaseConfigured,
  } = useAppContext()
  const [registerForm, setRegisterForm] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
    birthDate: '',
    location: '',
    interests: '',
    consentAge: false,
    consentPrivacy: true,
    consentPolicy: false,
  })
  const [isGoogleRegister, setIsGoogleRegister] = useState(false)
  const [signInForm, setSignInForm] = useState({
    email: '',
    password: '',
  })
  const [pendingRedirect, setPendingRedirect] = useState<null | 'signin' | 'register'>(
    null
  )
  const location = useLocation()
  const navigate = useNavigate()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const redirectFrom = (location.state as { from?: string } | null)?.from
  const fallbackRedirect = `/${lang}/profile`
  const redirectTarget =
    redirectFrom && !redirectFrom.includes('/register') ? redirectFrom : fallbackRedirect

  const handleGoogleRegisterClick = async () => {
    const result = await handleGoogleRegisterStart()
    if (!result.ok) {
      return
    }
    setIsGoogleRegister(true)
    setRegisterForm((prev) => ({
      ...prev,
      displayName: prev.displayName || result.user?.displayName || '',
      email: prev.email || result.user?.email || '',
      birthDate: prev.birthDate || result.birthDate || '',
      password: '',
      confirmPassword: '',
    }))
  }

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isGoogleRegister && registerForm.password !== registerForm.confirmPassword) {
      return
    }
    if (!registerForm.birthDate || !isAdult(registerForm.birthDate)) {
      return
    }
    const registerDetails = {
      displayName: registerForm.displayName.trim(),
      email: registerForm.email.trim(),
      birthDate: registerForm.birthDate,
      location: registerForm.location.trim(),
      interests: registerForm.interests
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      consentAge: registerForm.consentAge,
      consentPrivacy: registerForm.consentPrivacy,
      consentPolicy: registerForm.consentPolicy,
    }
    setPendingRedirect('register')
    if (isGoogleRegister) {
      await handleGoogleRegister(registerDetails)
    } else {
      await handleRegister({ ...registerDetails, password: registerForm.password })
    }
  }

  const passwordMismatch =
    !isGoogleRegister &&
    registerForm.password.length > 0 &&
    registerForm.confirmPassword.length > 0 &&
    registerForm.password !== registerForm.confirmPassword
  const underage =
    registerForm.birthDate.length > 0 && !isAdult(registerForm.birthDate)
  const passwordReady =
    isGoogleRegister ||
    (registerForm.password.length >= 8 && registerForm.confirmPassword.length >= 8)
  const canSubmit =
    firebaseConfigured &&
    registerForm.displayName.trim().length > 0 &&
    registerForm.email.trim().length > 0 &&
    passwordReady &&
    registerForm.birthDate.length > 0 &&
    registerForm.consentAge &&
    registerForm.consentPolicy &&
    !passwordMismatch &&
    !underage &&
    !registerLoading
  const isRegisterSuccess = registerStatus === copy.register_status_success

  useEffect(() => {
    if (!authUser) {
      return
    }
    if (isGoogleRegister && !isRegisterSuccess) {
      return
    }
    if (pendingRedirect === 'register' && !isRegisterSuccess) {
      return
    }
    navigate(redirectTarget, { replace: true })
  }, [
    authUser,
    isGoogleRegister,
    isRegisterSuccess,
    pendingRedirect,
    navigate,
    redirectTarget,
  ])

  return (
    <section className="feature">
      <div className="section-title">
        <h3>{copy.register_page_title}</h3>
        <p>{copy.register_page_subtitle}</p>
      </div>
      <div className="auth-panel register-panel reveal">
        {isRegisterSuccess ? (
          <div className="register-form register-success">
            <div className="register-header">
              <p className="register-kicker">{copy.register_kicker}</p>
              <h4>{copy.register_heading}</h4>
              <p>{copy.register_status_success}</p>
            </div>
            <span className="auth-status">{authStatus}</span>
          </div>
        ) : (
          <div className="register-form">
            <div className="register-header">
              <p className="register-kicker">{copy.register_kicker}</p>
              <h4>{copy.register_heading}</h4>
              <p>{copy.register_body}</p>
            </div>
            <form className="register-grid" onSubmit={handleRegisterSubmit}>
              <label className="register-field">
                {copy.label_display_name}
                <input
                  className="register-input"
                  type="text"
                  placeholder={copy.placeholder_display_name}
                  value={registerForm.displayName}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      displayName: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="register-field">
                {copy.label_email}
                <input
                  className="register-input"
                  type="email"
                  placeholder={copy.placeholder_email}
                  value={registerForm.email}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <div className="register-google register-span">
                <button
                  className="ghost"
                  type="button"
                  onClick={handleGoogleRegisterClick}
                  disabled={registerLoading}
                >
                  {copy.register_google_cta}
                </button>
                <p className="muted">{copy.register_google_hint}</p>
              </div>
              {!isGoogleRegister ? (
                <>
                  <label className="register-field">
                    {copy.label_password}
                    <input
                      className="register-input"
                      type="password"
                      placeholder={copy.placeholder_password}
                      value={registerForm.password}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          password: event.target.value,
                        }))
                      }
                      required
                      minLength={8}
                    />
                  </label>
                  <label className="register-field">
                    {copy.label_confirm_password}
                    <input
                      className="register-input"
                      type="password"
                      placeholder={copy.placeholder_confirm_password}
                      value={registerForm.confirmPassword}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          confirmPassword: event.target.value,
                        }))
                      }
                      required
                      minLength={8}
                    />
                  </label>
                </>
              ) : null}
              <label className="register-field">
                {copy.label_birth_date}
                <input
                  className="register-input"
                  type="date"
                  placeholder={copy.placeholder_birth_date}
                  value={registerForm.birthDate}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      birthDate: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className="register-field register-span">
                {copy.label_location}
                <input
                  className="register-input"
                  type="text"
                  placeholder={copy.placeholder_location}
                  value={registerForm.location}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      location: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="register-field register-span">
                {copy.label_interests}
                <input
                  className="register-input"
                  type="text"
                  placeholder={copy.placeholder_interests}
                  value={registerForm.interests}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      interests: event.target.value,
                    }))
                  }
                />
                <div className="register-tags">
                  <span>{copy.interest_tag_1}</span>
                  <span>{copy.interest_tag_2}</span>
                  <span>{copy.interest_tag_3}</span>
                  <span>{copy.interest_tag_4}</span>
                </div>
              </label>
              <div className="register-consent register-span">
                <label className="register-checkbox">
                  <input
                    type="checkbox"
                    checked={registerForm.consentAge}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        consentAge: event.target.checked,
                      }))
                    }
                    required
                  />
                  {copy.consent_age}
                </label>
                <label className="register-checkbox">
                  <input
                    type="checkbox"
                    checked={registerForm.consentPrivacy}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        consentPrivacy: event.target.checked,
                      }))
                    }
                  />
                  {copy.consent_privacy}
                </label>
                <label className="register-checkbox">
                  <input
                    type="checkbox"
                    checked={registerForm.consentPolicy}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        consentPolicy: event.target.checked,
                      }))
                    }
                    required
                  />
                  <span>
                    {copy.consent_policy_prefix}
                    <Link to={`/${lang}/guidelines`}>{copy.consent_policy_link}</Link>
                    {copy.consent_policy_suffix}
                  </span>
                </label>
              </div>
              <div className="register-actions register-span">
                <button className="cta" type="submit" disabled={!canSubmit}>
                  {registerLoading ? copy.register_creating : copy.register_create}
                </button>
                {passwordMismatch ? (
                  <span className="register-status register-status--error">
                    {copy.register_password_mismatch}
                  </span>
                ) : null}
                {underage ? (
                  <span className="register-status register-status--error">
                    {copy.register_underage}
                  </span>
                ) : null}
                {registerStatus ? (
                  <span className="register-status">{registerStatus}</span>
                ) : null}
              </div>
            </form>
          </div>
        )}
        <aside className="register-aside">
          <div>
            <p className="step-label">{copy.register_expect_label}</p>
            <p>{copy.register_expect_text}</p>
          </div>
          <div>
            <p className="step-label">{copy.register_privacy_label}</p>
            <p>{copy.register_privacy_text}</p>
          </div>
          <div>
            <p className="step-label">{copy.register_trust_label}</p>
            <p>{copy.register_trust_text}</p>
          </div>
          <div className="register-signin">
            <p className="muted">{copy.register_have_account}</p>
            <label className="register-field">
              {copy.label_email}
              <input
                className="register-input"
                type="email"
                placeholder={copy.placeholder_email}
                value={signInForm.email}
                onChange={(event) =>
                  setSignInForm((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
              />
            </label>
            <label className="register-field">
              {copy.label_password}
              <input
                className="register-input"
                type="password"
                placeholder={copy.placeholder_password}
                value={signInForm.password}
                onChange={(event) =>
                  setSignInForm((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
              />
            </label>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setPendingRedirect('signin')
                handleEmailSignIn({
                  email: signInForm.email,
                  password: signInForm.password,
                })
              }}
              disabled={
                !firebaseConfigured ||
                signInLoading ||
                !signInForm.email.trim() ||
                !signInForm.password
              }
            >
              {copy.register_sign_in}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setPendingRedirect('signin')
                handleAuthClick()
              }}
              disabled={!firebaseConfigured}
            >
              {authUser ? copy.auth_sign_out : copy.auth_sign_in_google}
            </button>
            <span className="auth-status">{authStatus}</span>
            {signInStatus ? (
              <span className="register-status">{signInStatus}</span>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  )
}

const ProfilePage = () => {
  const {
    authUser,
    authEmail,
    authUid,
    firebaseConfigured,
    handleProfileLoad,
    handleProfileUpdate,
    handlePhotoUpload,
    handleNotificationsEnable,
    handleNotificationsDisable,
    handleVerificationSubmit: handleVerificationSubmitRequest,
    relationshipLinks,
    pendingLinkRequests,
    handleLinkRequest,
    handleLinkResponse,
    handleLinkVisibility,
  } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const [profileForm, setProfileForm] = useState({
    displayName: authUser || '',
    birthDate: '',
    location: '',
    locationLat: '',
    locationLng: '',
    interests: '',
    consentPrivacy: true,
  })
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('')
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('')
  const [photoProcessedFile, setPhotoProcessedFile] = useState<File | null>(null)
  const [photoStatus, setPhotoStatus] = useState('')
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [notificationsStatus, setNotificationsStatus] = useState('')
  const [verificationFile, setVerificationFile] = useState<File | null>(null)
  const [verificationStatus, setVerificationStatus] = useState('')
  const [verificationLoading, setVerificationLoading] = useState(false)
  const [profileStatus, setProfileStatus] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [linkEmail, setLinkEmail] = useState('')
  const [linkType, setLinkType] =
    useState<RelationshipLink['link_type']>('Polycule Member')
  const [linkStatus, setLinkStatus] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)

  useEffect(() => {
    const loadProfile = async () => {
      if (!authUid || !firebaseConfigured) {
        return
      }
      const result = await handleProfileLoad()
      if (!result.ok || !result.data) {
        if (result.message) {
          setProfileStatus(result.message)
        }
        return
      }
      setProfileForm({
        displayName: result.data.displayName || authUser || '',
        birthDate: result.data.birthDate || '',
        location: result.data.location || '',
        locationLat: result.data.locationLat || '',
        locationLng: result.data.locationLng || '',
        interests: (result.data.interests || []).join(', '),
        consentPrivacy: result.data.consentPrivacy ?? true,
      })
      if (typeof result.data.photoUrl === 'string') {
        setProfilePhotoUrl(result.data.photoUrl)
      }
    }
    loadProfile()
  }, [authUid, authUser, firebaseConfigured, handleProfileLoad])

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl)
      }
    }
  }, [photoPreviewUrl])

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setNotificationsEnabled(false)
      return
    }
    setNotificationsEnabled(Notification.permission === 'granted')
  }, [])

  const underage =
    profileForm.birthDate.length > 0 && !isAdult(profileForm.birthDate)

  const outgoingRequests = relationshipLinks.filter(
    (link) => link.status === 'Pending' && link.user_a === authUid
  )
  const confirmedLinks = relationshipLinks.filter(
    (link) => link.status === 'Confirmed'
  )

  const getCounterpart = (link: RelationshipLink) => {
    const isSelfA = link.user_a === authUid
    const name = isSelfA ? link.user_b_name : link.user_a_name
    const email = isSelfA ? link.user_b_email : link.user_a_email
    return {
      label: name || email || 'Member',
      email,
    }
  }

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (underage) {
      setProfileStatus(copy.register_underage)
      return
    }
    setProfileLoading(true)
    const result = await handleProfileUpdate({
      displayName: profileForm.displayName.trim(),
      birthDate: profileForm.birthDate,
      location: profileForm.location.trim(),
      locationLat: profileForm.locationLat.trim(),
      locationLng: profileForm.locationLng.trim(),
      interests: profileForm.interests
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      consentPrivacy: profileForm.consentPrivacy,
    })
    setProfileStatus(result.message)
    setProfileLoading(false)
  }

  const handlePhotoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const uploadFile = photoProcessedFile || photoFile
    if (!uploadFile) {
      setPhotoStatus(copy.photo_upload_error)
      return
    }
    setPhotoLoading(true)
    const result = await handlePhotoUpload(uploadFile)
    if (result.ok && result.url) {
      setProfilePhotoUrl(result.url)
      setPhotoFile(null)
      setPhotoProcessedFile(null)
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl)
        setPhotoPreviewUrl('')
      }
    }
    setPhotoStatus(result.message)
    setPhotoLoading(false)
  }

  const handleLinkSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLinkLoading(true)
    const result = await handleLinkRequest({
      email: linkEmail,
      linkType,
    })
    setLinkStatus(result.message)
    if (result.ok) {
      setLinkEmail('')
    }
    setLinkLoading(false)
  }

  const handleNotificationsToggle = async () => {
    setNotificationsStatus('')
    if (notificationsEnabled) {
      const result = await handleNotificationsDisable()
      setNotificationsStatus(result.message)
      if (result.ok) {
        setNotificationsEnabled(false)
      }
      return
    }
    const result = await handleNotificationsEnable()
    setNotificationsStatus(result.message)
    if (result.ok) {
      setNotificationsEnabled(true)
    }
  }

  const handleVerificationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!verificationFile) {
      setVerificationStatus(copy.verification_status_error)
      return
    }
    setVerificationLoading(true)
    const result = await handleVerificationSubmitRequest(verificationFile)
    setVerificationStatus(result.message)
    if (result.ok) {
      setVerificationFile(null)
    }
    setVerificationLoading(false)
  }

  if (!authUser) {
    return (
      <section className="feature">
        <div className="section-title">
          <h3>{copy.profile_page_title}</h3>
          <p>{copy.profile_signin_prompt}</p>
        </div>
        <Link className="cta" to={`/${lang}/register`} state={registerState}>
          {copy.request_access}
        </Link>
      </section>
    )
  }

  return (
    <section className="feature">
      <div className="section-title">
        <h3>{copy.profile_page_title}</h3>
        <p>{copy.profile_page_subtitle}</p>
      </div>
      <div className="auth-panel register-panel reveal">
        <div className="register-form">
          <div className="register-header">
            <p className="register-kicker">{copy.register_kicker}</p>
            <h4>{copy.register_heading}</h4>
            <p>{copy.register_body}</p>
          </div>
          <form className="register-grid" onSubmit={handleProfileSubmit}>
            <label className="register-field">
              {copy.label_display_name}
              <input
                className="register-input"
                type="text"
                placeholder={copy.placeholder_display_name}
                value={profileForm.displayName}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    displayName: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="register-field">
              {copy.label_email}
              <input
                className="register-input"
                type="email"
                value={authEmail || ''}
                disabled
              />
            </label>
            <label className="register-field">
              {copy.label_birth_date}
              <input
                className="register-input"
                type="date"
                placeholder={copy.placeholder_birth_date}
                value={profileForm.birthDate}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    birthDate: event.target.value,
                  }))
                }
              />
            </label>
            <label className="register-field register-span">
              {copy.label_location}
              <input
                className="register-input"
                type="text"
                placeholder={copy.placeholder_location}
                value={profileForm.location}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    location: event.target.value,
                  }))
                }
              />
            </label>
            <label className="register-field">
              {copy.label_location_lat}
              <input
                className="register-input"
                type="text"
                placeholder={copy.placeholder_location_lat}
                value={profileForm.locationLat}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    locationLat: event.target.value,
                  }))
                }
              />
            </label>
            <label className="register-field">
              {copy.label_location_lng}
              <input
                className="register-input"
                type="text"
                placeholder={copy.placeholder_location_lng}
                value={profileForm.locationLng}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    locationLng: event.target.value,
                  }))
                }
              />
            </label>
            <label className="register-field register-span">
              {copy.label_interests}
              <input
                className="register-input"
                type="text"
                placeholder={copy.placeholder_interests}
                value={profileForm.interests}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    interests: event.target.value,
                  }))
                }
              />
            </label>
            <div className="register-consent register-span">
              <label className="register-checkbox">
                <input
                  type="checkbox"
                  checked={profileForm.consentPrivacy}
                  onChange={(event) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      consentPrivacy: event.target.checked,
                    }))
                  }
                />
                {copy.consent_privacy}
              </label>
            </div>
            <div className="register-actions register-span">
              <button className="cta" type="submit" disabled={profileLoading}>
                {profileLoading ? copy.profile_saving : copy.profile_save}
              </button>
              {underage ? (
                <span className="register-status register-status--error">
                  {copy.register_underage}
                </span>
              ) : null}
              {profileStatus ? (
                <span className="register-status">{profileStatus}</span>
              ) : null}
            </div>
          </form>
        </div>
      </div>
      <div className="detail-grid photo-grid">
        <div className="data-card detail-card">
          <h5>{copy.photo_upload_label}</h5>
          <div className="photo-panel">
            <div className="photo-preview">
              {photoPreviewUrl || profilePhotoUrl ? (
                <img
                  src={photoPreviewUrl || profilePhotoUrl}
                  alt={profileForm.displayName}
                />
              ) : (
                <div className="photo-placeholder">
                  {getInitials(profileForm.displayName || authUser || 'User')}
                </div>
              )}
            </div>
            <form className="link-form" onSubmit={handlePhotoSubmit}>
              <label>
                {copy.photo_upload_label}
                <input
                  className="register-input"
                  type="file"
                  accept="image/*"
                  onChange={async (eventInput) => {
                    const nextFile = eventInput.target.files?.[0] || null
                    setPhotoStatus('')
                    setPhotoFile(nextFile)
                    setPhotoProcessedFile(null)
                    if (photoPreviewUrl) {
                      URL.revokeObjectURL(photoPreviewUrl)
                      setPhotoPreviewUrl('')
                    }
                    if (!nextFile) {
                      return
                    }
                    try {
                      const result = await cropImageToSquare(nextFile)
                      setPhotoProcessedFile(result.file)
                      setPhotoPreviewUrl(result.previewUrl)
                    } catch (error) {
                      setPhotoStatus(copy.photo_upload_error)
                    }
                  }}
                />
              </label>
              <button className="cta" type="submit" disabled={photoLoading || !photoFile}>
                {photoLoading ? copy.event_rsvp_sending : copy.photo_upload_button}
              </button>
              {photoStatus ? <p className="register-status">{photoStatus}</p> : null}
            </form>
          </div>
        </div>
        <div className="data-card detail-card">
          <h5>{copy.notifications_title}</h5>
          <p className="muted">{copy.notifications_desc}</p>
          <div className="link-form">
            {typeof Notification !== 'undefined' &&
            Notification.permission === 'denied' ? (
              <p className="muted">{copy.notifications_blocked}</p>
            ) : null}
            <button className="cta" type="button" onClick={handleNotificationsToggle}>
              {notificationsEnabled
                ? copy.notifications_disable
                : copy.notifications_enable}
            </button>
            {notificationsStatus ? (
              <p className="register-status">{notificationsStatus}</p>
            ) : null}
          </div>
        </div>
        <div className="data-card detail-card">
          <h5>{copy.verification_title}</h5>
          <p className="muted">{copy.verification_desc}</p>
          <div className="verification-phrase">
            <span>{copy.verification_phrase_label}</span>
            <strong>{copy.verification_phrase}</strong>
          </div>
          <form className="link-form" onSubmit={handleVerificationSubmit}>
            <label>
              {copy.verification_upload_label}
              <input
                className="register-input"
                type="file"
                accept="image/*"
                onChange={(eventInput) =>
                  setVerificationFile(eventInput.target.files?.[0] || null)
                }
              />
            </label>
            <button
              className="cta"
              type="submit"
              disabled={verificationLoading || !verificationFile}
            >
              {verificationLoading
                ? copy.verification_submitting
                : copy.verification_submit}
            </button>
            {verificationStatus ? (
              <p className="register-status">{verificationStatus}</p>
            ) : null}
          </form>
        </div>
      </div>
      <div className="detail-grid link-grid">
        <div className="data-card detail-card">
          <h5>{copy.link_section_title}</h5>
          <p className="muted">{copy.link_section_subtitle}</p>
          <form className="link-form" onSubmit={handleLinkSubmit}>
            <label>
              {copy.link_request_email_label}
              <input
                className="register-input"
                type="email"
                placeholder={copy.link_request_email_placeholder}
                value={linkEmail}
                onChange={(event) => setLinkEmail(event.target.value)}
              />
            </label>
            <label>
              {copy.link_request_type_label}
              <select
                value={linkType}
                onChange={(event) =>
                  setLinkType(event.target.value as RelationshipLink['link_type'])
                }
              >
                <option value="Primary">Primary</option>
                <option value="Play Partner">Play Partner</option>
                <option value="Polycule Member">Polycule Member</option>
              </select>
            </label>
            <button className="cta" type="submit" disabled={linkLoading}>
              {linkLoading ? copy.link_request_sending : copy.link_request_send}
            </button>
            {linkStatus ? <p className="register-status">{linkStatus}</p> : null}
          </form>
        </div>
        <div className="data-card detail-card">
          <h5>{copy.link_requests_incoming_title}</h5>
          {pendingLinkRequests.length ? (
            <div className="link-list">
              {pendingLinkRequests.map((link) => {
                const counterpart = getCounterpart(link)
                return (
                  <div key={link.id} className="link-row">
                    <div>
                      <p className="link-name">{counterpart.label}</p>
                      <p className="muted">{link.link_type}</p>
                    </div>
                    <div className="link-actions">
                      <button
                        className="cta"
                        type="button"
                        onClick={() =>
                          link.id
                            ? handleLinkResponse(link.id, 'Confirmed')
                            : Promise.resolve()
                        }
                      >
                        {copy.link_request_accept}
                      </button>
                      <button
                        className="ghost"
                        type="button"
                        onClick={() =>
                          link.id
                            ? handleLinkResponse(link.id, 'Rejected')
                            : Promise.resolve()
                        }
                      >
                        {copy.link_request_decline}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="muted">{copy.link_requests_empty}</p>
          )}
        </div>
        <div className="data-card detail-card">
          <h5>{copy.link_requests_outgoing_title}</h5>
          {outgoingRequests.length ? (
            <div className="link-list">
              {outgoingRequests.map((link) => {
                const counterpart = getCounterpart(link)
                return (
                  <div key={link.id} className="link-row">
                    <div>
                      <p className="link-name">{counterpart.label}</p>
                      <p className="muted">{link.link_type}</p>
                    </div>
                    <span className="link-pill">{link.status}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="muted">{copy.link_requests_empty}</p>
          )}
        </div>
        <div className="data-card detail-card">
          <h5>{copy.link_requests_confirmed_title}</h5>
          {confirmedLinks.length ? (
            <div className="link-list">
              {confirmedLinks.map((link) => {
                const counterpart = getCounterpart(link)
                const merged = Boolean(link.merge_visibility)
                return (
                  <div key={link.id} className="link-row">
                    <div>
                      <p className="link-name">{counterpart.label}</p>
                      <p className="muted">{link.link_type}</p>
                    </div>
                    <label className="link-visibility">
                      <input
                        type="checkbox"
                        checked={merged}
                        onChange={(event) =>
                          link.id
                            ? handleLinkVisibility(link.id, event.target.checked)
                            : Promise.resolve()
                        }
                      />
                      <span>{copy.link_request_merge_label}</span>
                      <em>{merged ? copy.link_request_merge_on : copy.link_request_merge_off}</em>
                    </label>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="muted">{copy.link_requests_empty}</p>
          )}
        </div>
      </div>
    </section>
  )
}

const PublicProfilePage = () => {
  const { profiles } = useAppContext()
  const { slug } = useParams()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const profile = profiles.find((item) => item.slug === slug)

  if (!profile) {
    return <Navigate to={`/${lang}`} replace />
  }

  return (
    <section className="feature">
      <div className="section-title">
        <p className="breadcrumb">
          <Link to={`/${lang}#constellations`}>{copy.nav_constellations}</Link> /{' '}
          {profile.display_name}
        </p>
        <div className="profile-hero">
          <div className="photo-preview">
            {profile.photo_url ? (
              <img src={profile.photo_url} alt={profile.display_name} />
            ) : (
              <div className="photo-placeholder">
                {getInitials(profile.display_name)}
              </div>
            )}
          </div>
        </div>
        <h3>{profile.display_name}</h3>
        {profile.summary ? <p>{profile.summary}</p> : null}
      </div>
      <div className="detail-grid">
        <div className="data-card detail-card">
          <h5>{copy.label_location}</h5>
          <p>{profile.location || '—'}</p>
          {typeof profile.lat === 'number' && typeof profile.lng === 'number' ? (
            <p className="muted">
              ~{fuzzCoordinate(profile.lat)}, {fuzzCoordinate(profile.lng)}
            </p>
          ) : null}
        </div>
        <div className="data-card detail-card">
          <h5>{copy.label_interests}</h5>
          {profile.interests?.length ? (
            <div className="tag-row">
              {profile.interests.map((interest) => (
                <span key={`${profile.slug}-${interest}`}>{interest}</span>
              ))}
            </div>
          ) : (
            <p className="muted">—</p>
          )}
        </div>
        {profile.badges?.length ? (
          <div className="data-card detail-card">
            <h5>{copy.register_trust_label}</h5>
            <div className="tag-row">
              {profile.badges.map((badge) => (
                <span key={`${profile.slug}-${badge}`}>{badge}</span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

const GuidelinesPage = () => {
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)

  return (
    <section className="feature legal-page">
      <div className="section-title">
        <h3>{copy.guidelines_page_title}</h3>
        <p>{copy.guidelines_page_subtitle}</p>
      </div>
      <div className="legal-stack">
        <div className="legal-section">
          <h4>{copy.terms_title}</h4>
          <div className="legal-block">
            <h5>{copy.terms_eligibility_title}</h5>
            <ul className="legal-list">
              <li>{copy.terms_eligibility_item_1}</li>
              <li>{copy.terms_eligibility_item_2}</li>
            </ul>
          </div>
          <div className="legal-block">
            <h5>{copy.terms_content_title}</h5>
            <ul className="legal-list">
              <li>{copy.terms_content_item_1}</li>
              <li>{copy.terms_content_item_2}</li>
              <li>{copy.terms_content_item_3}</li>
            </ul>
          </div>
          <div className="legal-block">
            <h5>{copy.terms_prohibited_title}</h5>
            <ul className="legal-list">
              <li>{copy.terms_prohibited_item_1}</li>
              <li>{copy.terms_prohibited_item_2}</li>
            </ul>
          </div>
          <div className="legal-block">
            <h5>{copy.terms_liability_title}</h5>
            <ul className="legal-list">
              <li>{copy.terms_liability_item_1}</li>
              <li>{copy.terms_liability_item_2}</li>
            </ul>
          </div>
        </div>
        <div className="legal-section">
          <h4>{copy.guidelines_title}</h4>
          <div className="legal-block">
            <h5>{copy.guidelines_core_title}</h5>
            <ul className="legal-list">
              <li>{copy.guidelines_core_item_1}</li>
              <li>{copy.guidelines_core_item_2}</li>
              <li>{copy.guidelines_core_item_3}</li>
              <li>{copy.guidelines_core_item_4}</li>
            </ul>
          </div>
          <div className="legal-block">
            <h5>{copy.guidelines_constellation_title}</h5>
            <ul className="legal-list">
              <li>{copy.guidelines_constellation_item_1}</li>
              <li>{copy.guidelines_constellation_item_2}</li>
            </ul>
          </div>
          <div className="legal-block">
            <h5>{copy.guidelines_event_title}</h5>
            <ul className="legal-list">
              <li>{copy.guidelines_event_item_1}</li>
              <li>{copy.guidelines_event_item_2}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

const AdminPage = () => {
  const {
    pendingReviews,
    handleReviewModeration,
    isAdmin,
    reviews,
    clubNames,
    verificationRequests,
    handleVerificationModeration,
    pendingEventRsvps,
    events,
    handleEventRsvpUpdate,
  } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const approvedReviews = useMemo(
    () =>
      reviews.filter(
        (review) => review.status === 'approved' || review.status === 'published'
      ),
    [reviews]
  )
  const eventLookup = useMemo(
    () =>
      events.reduce<Record<string, Event>>((acc, event) => {
        acc[event.slug] = event
        return acc
      }, {}),
    [events]
  )

  if (!isAdmin) {
    return (
      <section className="feature">
        <div className="section-title">
          <h3>{copy.admin_access_denied_title}</h3>
          <p>{copy.admin_access_denied_body}</p>
        </div>
        <Link to={`/${lang}`} className="ghost">
          {copy.admin_back_home}
        </Link>
      </section>
    )
  }

  return (
    <section className="feature">
      <div className="section-title">
        <h3>{copy.admin_title}</h3>
        <p>{copy.admin_subtitle}</p>
      </div>
      <div className="admin-grid">
        <div className="admin-card">
          <p className="queue-label">{copy.admin_pending_title}</p>
          <h4>{pendingReviews.length}</h4>
          <p>{copy.admin_pending_desc}</p>
        </div>
        <div className="admin-card">
          <p className="queue-label">{copy.admin_approved_title}</p>
          <h4>{approvedReviews.length}</h4>
          <p>{copy.admin_approved_desc}</p>
        </div>
      </div>
      <div className="admin-panel">
        <div className="admin-panel-header">
          <h4>{copy.admin_queue_title}</h4>
        </div>
        {pendingReviews.length ? (
          <div className="admin-list">
            {pendingReviews.map((review) => (
              <div className="admin-item" key={review.id || review.club_slug}>
                <div className="admin-item-main">
                  <p className="review-name">
                    {review.author_slug
                      ? review.author_slug.replace(/-/g, ' ')
                      : copy.review_author_anonymous}
                  </p>
                  <p className="muted">
                    {clubNames[review.club_slug] || review.club_slug} ·{' '}
                    {copy.review_rating_label} {review.rating}/5
                  </p>
                  <p className="admin-text">{review.text}</p>
                </div>
                <div className="admin-actions">
                  <button
                    className="ghost"
                    type="button"
                    onClick={() =>
                      review.id && handleReviewModeration(review.id, 'rejected')
                    }
                  >
                    {copy.admin_action_reject}
                  </button>
                  <button
                    className="cta"
                    type="button"
                    onClick={() =>
                      review.id && handleReviewModeration(review.id, 'approved')
                    }
                  >
                    {copy.admin_action_approve}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{copy.admin_no_pending}</p>
        )}
      </div>
      <div className="admin-panel">
        <div className="admin-panel-header">
          <h4>{copy.verification_admin_title}</h4>
          <p className="muted">{copy.verification_admin_desc}</p>
        </div>
        {verificationRequests.length ? (
          <div className="admin-list">
            {verificationRequests.map((request) => (
              <div className="admin-item" key={request.id || request.user_uid}>
                <div className="admin-item-main">
                  <p className="review-name">{request.user_name}</p>
                  <p className="muted">{request.user_email}</p>
                  <p className="muted">
                    {copy.verification_phrase_label}: {request.phrase}
                  </p>
                  {request.photo_url ? (
                    <img
                      className="admin-photo"
                      src={request.photo_url}
                      alt={request.user_name}
                    />
                  ) : null}
                </div>
                <div className="admin-actions">
                  <button
                    className="ghost"
                    type="button"
                    onClick={() =>
                      request.id &&
                      handleVerificationModeration(request.id, 'rejected')
                    }
                  >
                    {copy.verification_admin_reject}
                  </button>
                  <button
                    className="cta"
                    type="button"
                    onClick={() =>
                      request.id &&
                      handleVerificationModeration(request.id, 'approved')
                    }
                  >
                    {copy.verification_admin_approve}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{copy.verification_admin_empty}</p>
        )}
      </div>
      <div className="admin-panel">
        <div className="admin-panel-header">
          <h4>{copy.admin_events_title}</h4>
          <p className="muted">{copy.admin_events_desc}</p>
        </div>
        {pendingEventRsvps.length ? (
          <div className="admin-list">
            {pendingEventRsvps.map((rsvp) => {
              const event = eventLookup[rsvp.event_slug]
              const categoryLabel =
                rsvp.category === 'men'
                  ? copy.event_cap_men
                  : rsvp.category === 'women'
                    ? copy.event_cap_women
                    : copy.event_cap_couples
              return (
                <div
                  className="admin-item"
                  key={rsvp.id || `${rsvp.event_slug}-${rsvp.user_uid}`}
                >
                  <div className="admin-item-main">
                    <p className="review-name">{rsvp.user_name}</p>
                    <p className="muted">{rsvp.user_email}</p>
                    <p className="muted">
                      {event ? `${event.title} · ${event.date} · ${event.city}` : rsvp.event_slug}
                    </p>
                    <p className="admin-text">
                      {copy.event_rsvp_category_label}: {categoryLabel}
                    </p>
                    {rsvp.trust_badges?.length ? (
                      <div className="tag-row">
                        {rsvp.trust_badges.map((badge) => (
                          <span key={`${rsvp.user_uid}-${badge}`}>{badge}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="admin-actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={() =>
                        rsvp.id ? handleEventRsvpUpdate(rsvp.id, 'Declined') : null
                      }
                    >
                      {copy.event_guest_action_decline}
                    </button>
                    <button
                      className="cta"
                      type="button"
                      onClick={() =>
                        rsvp.id ? handleEventRsvpUpdate(rsvp.id, 'Approved') : null
                      }
                    >
                      {copy.event_guest_action_approve}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="muted">{copy.admin_events_empty}</p>
        )}
      </div>
      <div className="admin-panel">
        <div className="admin-panel-header">
          <h4>{copy.admin_recent_title}</h4>
        </div>
        {approvedReviews.length ? (
          <div className="admin-list">
            {approvedReviews.slice(0, 6).map((review) => (
              <div className="admin-item" key={review.id || review.club_slug}>
                <div className="admin-item-main">
                  <p className="review-name">
                    {review.author_slug
                      ? review.author_slug.replace(/-/g, ' ')
                      : copy.review_author_anonymous}
                  </p>
                  <p className="muted">
                    {clubNames[review.club_slug] || review.club_slug} ·{' '}
                    {copy.review_rating_label} {review.rating}/5
                  </p>
                  <p className="admin-text">{review.text}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{copy.admin_recent_empty}</p>
        )}
      </div>
    </section>
  )
}

const ClubsPage = () => {
  const { clubs, handleClubSubmit, authUser, firebaseConfigured } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const [clubName, setClubName] = useState('')
  const [clubCity, setClubCity] = useState('')
  const [clubCountry, setClubCountry] = useState('')
  const [clubWebsite, setClubWebsite] = useState('')
  const [clubSummary, setClubSummary] = useState('')
  const [clubStatus, setClubStatus] = useState('')
  const [clubLoading, setClubLoading] = useState(false)

  const canSubmitClub =
    firebaseConfigured && authUser && clubName.trim().length > 1 && !clubLoading
  const clubHeaderStatus =
    clubStatus || (!authUser ? copy.club_submit_signin_required : copy.auth_sign_in_success)
  const clubHeaderIsError =
    !authUser ||
    clubStatus === copy.club_submit_status_error ||
    clubStatus === copy.club_submit_permission_error

  const handleSubmitClub = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setClubLoading(true)
    const result = await handleClubSubmit({
      name: clubName,
      city: clubCity,
      country: clubCountry,
      website: clubWebsite,
      summary: clubSummary,
    })
    setClubStatus(result.message)
    if (result.ok) {
      setClubName('')
      setClubCity('')
      setClubCountry('')
      setClubWebsite('')
      setClubSummary('')
    }
    setClubLoading(false)
  }

  return (
    <section className="feature">
      <div className="section-title">
        <h3>{copy.clubs_page_title}</h3>
        <p>{copy.clubs_page_desc}</p>
      </div>
      <div className="club-grid">
        {clubs.map((club) => (
          <article className="data-card reveal" key={club.slug}>
            <h5>
              <Link to={`/${lang}/clubs/${club.slug}`}>{club.name}</Link>
            </h5>
            <p>{getLocalizedText(club.summary, lang)}</p>
            <div className="meta-row">
              <span>
                {club.city ? `${club.city}, ` : ''}
                {club.country}
              </span>
            </div>
          </article>
        ))}
      </div>
      <div className="review-panel">
        <div className="section-title">
          <h3>{copy.club_submit_title}</h3>
          <p>{copy.club_submit_desc}</p>
        </div>
        <form className="review-form" onSubmit={handleSubmitClub}>
          <div className="review-form-header">
            <p
              className={
                clubHeaderIsError ? 'review-status review-status--error' : 'review-status'
              }
            >
              {clubHeaderStatus}
            </p>
          </div>
          <label>
            {copy.club_submit_name_label}
            <input
              className="register-input"
              value={clubName}
              onChange={(event) => setClubName(event.target.value)}
              placeholder={copy.club_submit_name_label}
            />
          </label>
          <label>
            {copy.club_submit_city_label}
            <input
              className="register-input"
              value={clubCity}
              onChange={(event) => setClubCity(event.target.value)}
              placeholder={copy.club_submit_city_label}
            />
          </label>
          <label>
            {copy.club_submit_country_label}
            <input
              className="register-input"
              value={clubCountry}
              onChange={(event) => setClubCountry(event.target.value)}
              placeholder={copy.club_submit_country_label}
            />
          </label>
          <label>
            {copy.club_submit_website_label}
            <input
              className="register-input"
              value={clubWebsite}
              onChange={(event) => setClubWebsite(event.target.value)}
              placeholder={copy.club_submit_website_label}
            />
          </label>
          <label>
            {copy.club_submit_summary_label}
            <textarea
              placeholder={copy.club_submit_summary_placeholder}
              value={clubSummary}
              onChange={(event) => setClubSummary(event.target.value)}
            ></textarea>
          </label>
          <button className="cta" type="submit" disabled={!canSubmitClub}>
            {clubLoading ? copy.club_submit_submitting : copy.club_submit_submit}
          </button>
          {clubStatus && clubStatus !== copy.auth_sign_in_success ? (
            <p className="review-status">{clubStatus}</p>
          ) : null}
        </form>
      </div>
    </section>
  )
}

const EventsPage = () => {
  const { events, authEmail } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const email = authEmail?.toLowerCase()

  const visibleEvents = useMemo(() => {
    return events
      .filter((event) => {
        if (event.privacy_tier !== 'Private') {
          return true
        }
        const invited = event.invited_emails?.map((value) => value.toLowerCase()) || []
        return email ? invited.includes(email) || email === event.host_email.toLowerCase() : false
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [events, email])

  return (
    <section className="feature">
      <div className="section-title">
        <h3>{copy.events_page_title}</h3>
        <p>{copy.events_page_desc}</p>
      </div>
      <div className="club-grid">
        {visibleEvents.map((event) => {
          const privacyLabel =
            event.privacy_tier === 'Public'
              ? copy.event_privacy_public
              : event.privacy_tier === 'Vetted'
                ? copy.event_privacy_vetted
                : copy.event_privacy_private

          return (
            <article className="data-card reveal" key={event.slug}>
              <h5>
                <Link to={`/${lang}/events/${event.slug}`}>{event.title}</Link>
              </h5>
              <p>{event.summary}</p>
              <div className="meta-row">
                <span>{event.date}</span>
                <span>{event.city}</span>
                <span>{privacyLabel}</span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

const EventDetail = () => {
  const {
    events,
    authUser,
    authEmail,
    authUid,
    firebaseConfigured,
    subscribeEventRsvps,
    handleEventRsvpSubmit,
    handleEventRsvpUpdate,
  } = useAppContext()
  const { slug } = useParams()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const event = events.find((item) => item.slug === slug)
  const [rsvps, setRsvps] = useState<EventRsvp[]>([])
  const [rsvpCategory, setRsvpCategory] = useState<keyof EventCap>('couples')
  const [rsvpStatus, setRsvpStatus] = useState('')
  const [rsvpLoading, setRsvpLoading] = useState(false)
  const [liveStatus, setLiveStatus] = useState<LiveStatusKey | null>(null)
  const [chatMessages, setChatMessages] = useState<
    Array<{ id: string; name: string; text: string; time: string }>
  >([])
  const [chatText, setChatText] = useState('')
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!event || !firebaseConfigured) {
      setRsvps([])
      return
    }
    const unsubscribe = subscribeEventRsvps(event.slug, setRsvps)
    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [event, firebaseConfigured, subscribeEventRsvps])

  useEffect(() => {
    if (!event) {
      return
    }
    const socket = io()
    socketRef.current = socket
    socket.emit('joinEvent', { eventSlug: event.slug })
    socket.on('eventStatus', (payload) => {
      if (payload?.eventSlug === event.slug) {
        setLiveStatus(payload.status as LiveStatusKey)
      }
    })
    socket.on('eventMessage', (message) => {
      if (!message?.id) {
        return
      }
      setChatMessages((prev) => [...prev, message])
    })
    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [event])

  if (!event) {
    return (
      <section className="feature">
        <div className="section-title">
          <h3>{copy.event_not_found_title}</h3>
          <p>{copy.event_not_found_body}</p>
        </div>
        <Link to={`/${lang}/events`} className="ghost">
          {copy.event_back}
        </Link>
      </section>
    )
  }

  const isHost = authEmail?.toLowerCase() === event.host_email.toLowerCase()
  const invited =
    event.privacy_tier !== 'Private'
      ? true
      : authEmail
        ? event.invited_emails?.map((value) => value.toLowerCase()).includes(
            authEmail.toLowerCase()
          )
        : false

  if (event.privacy_tier === 'Private' && !invited && !isHost) {
    return (
      <section className="feature">
        <div className="section-title">
          <h3>{event.title}</h3>
          <p>{copy.event_privacy_notice_private}</p>
        </div>
        <Link to={`/${lang}/events`} className="ghost">
          {copy.event_back}
        </Link>
      </section>
    )
  }

  const privacyNote =
    event.privacy_tier === 'Public'
      ? copy.event_privacy_notice_public
      : event.privacy_tier === 'Vetted'
        ? copy.event_privacy_notice_vetted
        : copy.event_privacy_notice_private
  const privacyLabel =
    event.privacy_tier === 'Public'
      ? copy.event_privacy_public
      : event.privacy_tier === 'Vetted'
        ? copy.event_privacy_vetted
        : copy.event_privacy_private

  const userRsvp = authUid
    ? rsvps.find((item) => item.user_uid === authUid)
    : undefined
  const approvedRsvps = rsvps.filter((item) => item.status === 'Approved')
  const pendingRsvps = rsvps.filter((item) => item.status === 'Pending')

  const counts = rsvps.reduce(
    (acc, item) => {
      if (item.status !== 'Declined') {
        acc[item.category] += 1
      }
      return acc
    },
    { men: 0, women: 0, couples: 0 }
  )
  const isFull = counts[rsvpCategory] >= event.cap[rsvpCategory]
  const canSubmit =
    firebaseConfigured &&
    authUser &&
    !userRsvp &&
    !rsvpLoading &&
    !isFull

  const addressVisible =
    event.privacy_tier === 'Public' ||
    isHost ||
    (event.privacy_tier === 'Vetted' && userRsvp?.status === 'Approved')

  const handleSubmit = async (eventForm: FormEvent<HTMLFormElement>) => {
    eventForm.preventDefault()
    if (!event) {
      return
    }
    setRsvpLoading(true)
    const result = await handleEventRsvpSubmit(event, rsvpCategory)
    setRsvpStatus(result.message)
    setRsvpLoading(false)
  }

  const handleLiveStatusUpdate = (status: LiveStatusKey) => {
    if (!event || !socketRef.current) {
      return
    }
    socketRef.current.emit('eventStatus', { eventSlug: event.slug, status })
    setLiveStatus(status)
  }

  const handleChatSubmit = (eventForm: FormEvent<HTMLFormElement>) => {
    eventForm.preventDefault()
    if (!event || !socketRef.current) {
      return
    }
    const text = chatText.trim()
    if (!text) {
      return
    }
    socketRef.current.emit('eventMessage', {
      eventSlug: event.slug,
      name: authUser || authEmail || 'Guest',
      text,
    })
    setChatText('')
  }

  const statusMessage =
    userRsvp?.status === 'Approved'
      ? copy.event_rsvp_approved
      : userRsvp?.status === 'Declined'
        ? copy.event_rsvp_declined
        : userRsvp?.status === 'Pending'
          ? copy.event_rsvp_pending
          : rsvpStatus

  const liveStatusLabel =
    liveStatus === 'full'
      ? copy.event_live_status_full
      : liveStatus === 'last_call'
        ? copy.event_live_status_last_call
        : copy.event_live_status_open

  return (
    <section className="feature">
      <div className="section-title">
        <p className="breadcrumb">
          <Link to={`/${lang}/events`}>{copy.events_page_title}</Link> / {event.title}
        </p>
        <h3>{event.title}</h3>
        <p>{event.summary}</p>
        <div className="badge-row">
          <span>{event.date}</span>
          <span>{event.city}</span>
          <span>{privacyLabel}</span>
        </div>
      </div>
      <div className="detail-grid">
        <div className="data-card detail-card">
          <h5>{copy.event_privacy_label}</h5>
          <p>{privacyNote}</p>
        </div>
        <div className="data-card detail-card">
          <h5>{copy.event_address_label}</h5>
          <p>{addressVisible ? event.address || '—' : copy.event_address_hidden}</p>
        </div>
        <div className="data-card detail-card">
          <h5>{copy.event_cap_label}</h5>
          <div className="info-grid">
            <div>
              <p className="info-label">{copy.event_cap_men}</p>
              <p>
                {counts.men}/{event.cap.men}
              </p>
            </div>
            <div>
              <p className="info-label">{copy.event_cap_women}</p>
              <p>
                {counts.women}/{event.cap.women}
              </p>
            </div>
            <div>
              <p className="info-label">{copy.event_cap_couples}</p>
              <p>
                {counts.couples}/{event.cap.couples}
              </p>
            </div>
          </div>
        </div>
        <div className="data-card detail-card">
          <h5>{copy.event_rsvp_title}</h5>
          <p className="muted">{copy.event_rsvp_desc}</p>
          {!authUser ? (
            <p className="muted">{copy.event_rsvp_signed_out}</p>
          ) : userRsvp ? (
            <p className="muted">{statusMessage}</p>
          ) : (
            <form className="link-form" onSubmit={handleSubmit}>
              <label>
                {copy.event_rsvp_category_label}
                <select
                  value={rsvpCategory}
                  onChange={(eventInput) =>
                    setRsvpCategory(eventInput.target.value as keyof EventCap)
                  }
                >
                  <option value="men">{copy.event_cap_men}</option>
                  <option value="women">{copy.event_cap_women}</option>
                  <option value="couples">{copy.event_cap_couples}</option>
                </select>
              </label>
              {isFull ? <p className="muted">{copy.event_rsvp_full}</p> : null}
              <button className="cta" type="submit" disabled={!canSubmit}>
                {rsvpLoading ? copy.event_rsvp_sending : copy.event_rsvp_submit}
              </button>
            </form>
          )}
          {!userRsvp && statusMessage ? (
            <p className="register-status">{statusMessage}</p>
          ) : null}
        </div>
        <div className="data-card detail-card">
          <h5>{copy.event_live_status_label}</h5>
          <p className="muted">{liveStatusLabel}</p>
          {isHost ? (
            <div className="link-actions">
              <button
                className="ghost"
                type="button"
                onClick={() => handleLiveStatusUpdate('open')}
              >
                {copy.event_live_status_open}
              </button>
              <button
                className="ghost"
                type="button"
                onClick={() => handleLiveStatusUpdate('full')}
              >
                {copy.event_live_status_full}
              </button>
              <button
                className="ghost"
                type="button"
                onClick={() => handleLiveStatusUpdate('last_call')}
              >
                {copy.event_live_status_last_call}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="detail-grid guest-grid">
        <div className="data-card detail-card">
          <h5>{copy.event_live_chat_title}</h5>
          <div className="chat-panel">
            <div className="chat-feed">
              {chatMessages.length ? (
                chatMessages.slice(-12).map((message) => (
                  <div key={message.id} className="chat-message">
                    <p className="chat-name">{message.name}</p>
                    <p>{message.text}</p>
                  </div>
                ))
              ) : (
                <p className="muted">{copy.event_guest_manager_empty}</p>
              )}
            </div>
            <form className="link-form" onSubmit={handleChatSubmit}>
              <label>
                {copy.event_live_chat_title}
                <input
                  className="register-input"
                  type="text"
                  placeholder={copy.event_live_chat_placeholder}
                  value={chatText}
                  onChange={(eventInput) => setChatText(eventInput.target.value)}
                />
              </label>
              <button className="cta" type="submit">
                {copy.event_live_chat_send}
              </button>
            </form>
          </div>
        </div>
      </div>
      {userRsvp?.status === 'Approved' && userRsvp.checkin_token ? (
        <div className="data-card detail-card qr-card">
          <h5>{copy.event_rsvp_qr_title}</h5>
          <p className="muted">{copy.event_rsvp_qr_desc}</p>
          <div className="qr-wrap">
            <QrToken token={userRsvp.checkin_token} />
            <p className="muted">{userRsvp.checkin_token.slice(0, 12)}</p>
          </div>
        </div>
      ) : null}
      {isHost ? (
        <div className="detail-grid guest-grid">
          <div className="data-card detail-card">
            <h5>{copy.event_guest_manager_title}</h5>
            <p className="muted">{copy.event_guest_manager_desc}</p>
            {pendingRsvps.length ? (
              <div className="link-list">
                {pendingRsvps.map((rsvp) => (
                  <div key={rsvp.id} className="link-row">
                    <div>
                      <p className="link-name">{rsvp.user_name}</p>
                      <p className="muted">
                        {rsvp.category} · {rsvp.user_email}
                      </p>
                      {rsvp.trust_badges?.length ? (
                        <div className="tag-row">
                          {rsvp.trust_badges.map((badge) => (
                            <span key={`${rsvp.user_uid}-${badge}`}>{badge}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="link-actions">
                      <button
                        className="cta"
                        type="button"
                        onClick={() =>
                          rsvp.id
                            ? handleEventRsvpUpdate(rsvp.id, 'Approved')
                            : Promise.resolve()
                        }
                      >
                        {copy.event_guest_action_approve}
                      </button>
                      <button
                        className="ghost"
                        type="button"
                        onClick={() =>
                          rsvp.id
                            ? handleEventRsvpUpdate(rsvp.id, 'Declined')
                            : Promise.resolve()
                        }
                      >
                        {copy.event_guest_action_decline}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">{copy.event_guest_manager_empty}</p>
            )}
          </div>
          <div className="data-card detail-card">
            <h5>{copy.event_guest_manager_approved}</h5>
            {approvedRsvps.length ? (
              <div className="link-list">
                {approvedRsvps.map((rsvp) => (
                  <div key={rsvp.id} className="link-row">
                    <div>
                      <p className="link-name">{rsvp.user_name}</p>
                      <p className="muted">
                        {rsvp.category} · {rsvp.user_email}
                      </p>
                    </div>
                    <span className="link-pill">{copy.event_rsvp_approved}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">{copy.event_guest_manager_empty}</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}

const HostDashboard = () => {
  const { events, authEmail, firebaseConfigured, subscribeEventRsvps } =
    useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const registerState = {
    from: `${location.pathname}${location.search}${location.hash}`,
  }
  const hostEmail = authEmail?.toLowerCase()
  const [rsvpMap, setRsvpMap] = useState<Record<string, EventRsvp[]>>({})

  const hostEvents = useMemo(() => {
    if (!hostEmail) {
      return []
    }
    return events.filter(
      (event) => event.host_email.toLowerCase() === hostEmail
    )
  }, [events, hostEmail])

  useEffect(() => {
    if (!firebaseConfigured || !hostEvents.length) {
      setRsvpMap({})
      return
    }
    const unsubscribes = hostEvents
      .map((event) =>
        subscribeEventRsvps(event.slug, (rsvps) => {
          setRsvpMap((prev) => ({ ...prev, [event.slug]: rsvps }))
        })
      )
      .filter(Boolean) as Array<() => void>

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe())
    }
  }, [firebaseConfigured, hostEvents, subscribeEventRsvps])

  if (!authEmail) {
    return (
      <section className="feature">
        <div className="section-title">
          <h3>{copy.host_dashboard_title}</h3>
          <p>{copy.host_dashboard_signin}</p>
        </div>
        <Link className="cta" to={`/${lang}/register`} state={registerState}>
          {copy.request_access}
        </Link>
      </section>
    )
  }

  if (!hostEvents.length) {
    return (
      <section className="feature">
        <div className="section-title">
          <h3>{copy.host_dashboard_title}</h3>
          <p>{copy.host_dashboard_empty}</p>
        </div>
        <Link className="ghost" to={`/${lang}/events`}>
          {copy.event_back}
        </Link>
      </section>
    )
  }

  return (
    <section className="feature">
      <div className="section-title">
        <h3>{copy.host_dashboard_title}</h3>
        <p>{copy.host_dashboard_desc}</p>
      </div>
      <div className="detail-grid">
        {hostEvents.map((event) => {
          const rsvps = rsvpMap[event.slug] ?? []
          const pending = rsvps.filter((item) => item.status === 'Pending')
          const approved = rsvps.filter((item) => item.status === 'Approved')
          return (
            <div key={event.slug} className="data-card detail-card">
              <h5>
                <Link to={`/${lang}/events/${event.slug}`}>{event.title}</Link>
              </h5>
              <p className="muted">
                {event.date} · {event.city}
              </p>
              <div className="info-grid">
                <div>
                  <p className="info-label">{copy.event_guest_manager_pending}</p>
                  <p>{pending.length}</p>
                </div>
                <div>
                  <p className="info-label">{copy.event_guest_manager_approved}</p>
                  <p>{approved.length}</p>
                </div>
              </div>
              {pending.length ? (
                <div className="link-list">
                  {pending.slice(0, 3).map((rsvp) => (
                    <div key={rsvp.id} className="link-row">
                      <div>
                        <p className="link-name">{rsvp.user_name}</p>
                        <p className="muted">{rsvp.category}</p>
                        {rsvp.trust_badges?.length ? (
                          <div className="tag-row">
                            {rsvp.trust_badges.map((badge) => (
                              <span key={`${rsvp.user_uid}-${badge}`}>{badge}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">{copy.event_guest_manager_empty}</p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const CityPage = () => {
  const { citySlug } = useParams()
  const { clubs, constellations } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)

  const cityClubs = clubs.filter(
    (club) => slugify(club.city || club.name) === citySlug
  )
  const cityConstellations = constellations.filter(
    (constellation) => slugify(constellation.city || constellation.name) === citySlug
  )
  const cityName =
    cityClubs[0]?.city || cityConstellations[0]?.city || copy.city_fallback

  return (
    <section className="feature">
      <div className="section-title">
        <p className="breadcrumb">
          <Link to={`/${lang}`}>{copy.city_breadcrumb_home}</Link> /{' '}
          <Link to={`/${lang}/clubs`}>{copy.city_breadcrumb_clubs}</Link> / {cityName}
        </p>
        <h3>{cityName}</h3>
        <p>{copy.city_title_desc}</p>
      </div>
      <div className="detail-grid">
        <div className="data-card detail-card">
          <h5>{copy.city_clubs_title}</h5>
          {cityClubs.length ? (
            <div className="city-list">
              {cityClubs.map((club) => (
                <div key={club.slug} className="city-item">
                  <h5>
                    <Link to={`/${lang}/clubs/${club.slug}`}>{club.name}</Link>
                  </h5>
                  <p className="muted">{getLocalizedText(club.summary, lang)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{copy.city_clubs_empty}</p>
          )}
        </div>
        <div className="data-card detail-card">
          <h5>{copy.city_constellations_title}</h5>
          {cityConstellations.length ? (
            <div className="city-list">
              {cityConstellations.map((constellation) => (
                <div key={constellation.slug} className="city-item">
                  <p>{constellation.name}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{copy.city_constellations_empty}</p>
          )}
        </div>
      </div>
    </section>
  )
}

const ClubDetail = () => {
  const { slug } = useParams()
  const { clubs, reviews, handleReviewSubmit, authUser, firebaseConfigured } =
    useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const club = clubs.find((item) => item.slug === slug)
  const clubReviews = reviews.filter((review) => review.club_slug === slug)
  const primaryReview = clubReviews[0]
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [reviewStatus, setReviewStatus] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewIdentity, setReviewIdentity] = useState<'profile' | 'anonymous'>(
    'profile'
  )

  const reviewSchema = useMemo(() => {
    if (!club || !clubReviews.length) {
      return null
    }
    const average =
      clubReviews.reduce((sum, review) => sum + review.rating, 0) /
      clubReviews.length

    return {
      '@context': 'https://schema.org',
      '@graph': clubReviews.map((review) => ({
        '@type': 'Review',
        author: {
          '@type': review.author_type === 'constellation' ? 'Organization' : 'Person',
          name: review.author_slug
            ? review.author_slug.replace(/-/g, ' ')
            : 'Anonymous',
        },
        datePublished: review.date || review.date_visited,
        reviewRating: {
          '@type': 'Rating',
          ratingValue: review.rating,
          bestRating: '5',
          worstRating: '1',
        },
        reviewBody: review.text.replace(/\s+/g, ' ').trim(),
        itemReviewed: {
          '@type': 'LocalBusiness',
          name: club.name,
          url: `/en/clubs/${club.slug}`,
          address: {
            '@type': 'PostalAddress',
            addressLocality: club.city,
            addressCountry: club.country_code || club.country,
          },
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: average.toFixed(1),
            reviewCount: clubReviews.length,
          },
        },
      })),
    }
  }, [club, clubReviews])

  if (!club) {
    return (
      <section className="feature">
        <div className="section-title">
          <h3>{copy.club_not_found_title}</h3>
          <p>{copy.club_not_found_body}</p>
        </div>
        <Link to={`/${lang}/clubs`} className="ghost">
          {copy.club_back}
        </Link>
      </section>
    )
  }

  const canSubmitReview =
    firebaseConfigured && authUser && reviewText.trim().length > 10 && !reviewLoading
  const reviewHeaderStatus =
    reviewStatus || (!authUser ? copy.review_signin_required : copy.auth_sign_in_success)
  const reviewHeaderIsError =
    !authUser ||
    reviewStatus === copy.review_status_error ||
    reviewStatus === copy.review_permission_error

  const handleSubmitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setReviewLoading(true)
    const result = await handleReviewSubmit({
      club,
      rating: reviewRating,
      text: reviewText,
      anonymous: reviewIdentity === 'anonymous',
    })
    setReviewStatus(result.message)
    if (result.ok) {
      setReviewText('')
      setReviewRating(5)
    }
    setReviewLoading(false)
  }

  return (
    <section className="feature">
      <div className="section-title">
        <p className="breadcrumb">
          <Link to={`/${lang}/clubs`}>{copy.clubs_page_title}</Link> / {club.name}
        </p>
        <h3>{club.name}</h3>
        <p>
          {club.city ? `${club.city}, ` : ''}
          {club.country}
        </p>
        <div className="badge-row">
          {club.country_code ? <span>{club.country_code}</span> : null}
          {primaryReview?.date_visited ? (
            <span>
              {copy.club_date_visited} {primaryReview.date_visited}
            </span>
          ) : null}
          {primaryReview?.party_type ? <span>{primaryReview.party_type}</span> : null}
        </div>
      </div>
      {reviewSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewSchema) }}
        />
      ) : null}
      <div className="detail-grid">
        <div className="data-card detail-card">
          <h5>{copy.club_description}</h5>
          <p>{getLocalizedText(club.summary, lang)}</p>
        </div>
        <div className="data-card detail-card">
          <h5>{copy.club_info}</h5>
          <div className="info-grid">
            <div>
              <p className="info-label">{copy.club_city}</p>
              <p>{club.city || '—'}</p>
            </div>
            <div>
              <p className="info-label">{copy.club_country}</p>
              <p>{club.country || '—'}</p>
            </div>
            <div>
              <p className="info-label">{copy.club_date_visited}</p>
              <p>{primaryReview?.date_visited || '—'}</p>
            </div>
            <div>
              <p className="info-label">{copy.club_dress_code}</p>
              <p>{primaryReview?.dress_code || '—'}</p>
            </div>
            <div>
              <p className="info-label">{copy.club_party_type}</p>
              <p>{primaryReview?.party_type || '—'}</p>
            </div>
            <div>
              <p className="info-label">{copy.club_day_of_week}</p>
              <p>{primaryReview?.day_of_week || '—'}</p>
            </div>
            <div>
              <p className="info-label">{copy.club_website}</p>
              {primaryReview?.website ? (
                <a href={primaryReview.website} target="_blank" rel="noreferrer">
                  {copy.club_visit_site}
                </a>
              ) : (
                <p>—</p>
              )}
            </div>
          </div>
          {primaryReview?.ratings ? (
            <div className="rating-grid">
              {Object.entries(primaryReview.ratings).map(([label, value]) => (
                <div key={label} className="rating-row">
                  <span>{label.replace(/_/g, ' ')}</span>
                  <span>{value}/5</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="review-section">
        <div className="section-title">
          <h3>{copy.reviews_title}</h3>
          <p>{copy.reviews_desc}</p>
        </div>
        <div className="review-panel review-panel--split">
          <div className="review-feed">
            <h4>{copy.reviews_club_title}</h4>
            <p>{copy.reviews_club_desc}</p>
            <div className="review-list">
              {clubReviews.length ? (
                clubReviews.map((review) => {
                  const authorLabel = review.author_slug
                    ? review.author_slug.replace(/-/g, ' ')
                    : copy.review_author_anonymous
                  const statusLabel = getStatusLabel(review.status, copy)
                  const paragraphs = review.text.split('\n\n')
                  return (
                    <div key={`${review.club_slug}-${review.author_slug}`}>
                      <div className="review-header">
                        <p className="review-name">{authorLabel}</p>
                        <span className="review-date">
                          {review.date || review.date_visited}
                        </span>
                      </div>
                      {paragraphs.map((paragraph, index) => (
                        <p key={`${review.club_slug}-p-${index}`}>{paragraph}</p>
                      ))}
                      <p className="muted">
                        {copy.review_rating_status
                          .replace('{rating}', String(review.rating))
                          .replace('{status}', statusLabel)}
                      </p>
                    </div>
                  )
                })
              ) : (
                <p className="muted">{copy.reviews_none}</p>
              )}
            </div>
          </div>
          <form className="review-form" onSubmit={handleSubmitReview}>
            <div className="review-form-header">
              <p
                className={
                  reviewHeaderIsError ? 'review-status review-status--error' : 'review-status'
                }
              >
                {reviewHeaderStatus}
              </p>
              {authUser ? (
                <label className="review-identity">
                  <span>{copy.review_identity_label}</span>
                  <select
                    value={reviewIdentity}
                    onChange={(event) =>
                      setReviewIdentity(event.target.value as 'profile' | 'anonymous')
                    }
                  >
                    <option value="profile">{copy.review_identity_profile}</option>
                    <option value="anonymous">{copy.review_identity_anonymous}</option>
                  </select>
                </label>
              ) : null}
            </div>
            <label>
              {copy.review_rating_label}
              <select
                value={reviewRating}
                onChange={(event) => setReviewRating(Number(event.target.value))}
              >
                <option value={5}>{copy.rating_option_5}</option>
                <option value={4}>{copy.rating_option_4}</option>
                <option value={3}>{copy.rating_option_3}</option>
                <option value={2}>{copy.rating_option_2}</option>
                <option value={1}>{copy.rating_option_1}</option>
              </select>
            </label>
            <label>
              {copy.review_text_label}
              <textarea
                placeholder={copy.review_text_placeholder}
                value={reviewText}
                onChange={(event) => setReviewText(event.target.value)}
              ></textarea>
            </label>
            <button className="cta" type="submit" disabled={!canSubmitReview}>
              {reviewLoading ? copy.review_submitting : copy.review_submit}
            </button>
            {reviewStatus && reviewStatus !== copy.auth_sign_in_success ? (
              <p className="review-status">{reviewStatus}</p>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  )
}

function App() {
  const [clubs, setClubs] = useState<Club[]>([])
  const [websites, setWebsites] = useState<Website[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [firestoreReviews, setFirestoreReviews] = useState<Review[]>([])
  const [pendingReviews, setPendingReviews] = useState<Review[]>([])
  const [constellations, setConstellations] = useState<Constellation[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [pendingEventRsvps, setPendingEventRsvps] = useState<EventRsvp[]>([])
  const [relationshipLinks, setRelationshipLinks] = useState<RelationshipLink[]>([])
  const [linksFromA, setLinksFromA] = useState<RelationshipLink[]>([])
  const [linksFromB, setLinksFromB] = useState<RelationshipLink[]>([])
  const [verificationRequests, setVerificationRequests] = useState<
    VerificationRequest[]
  >([])
  const [authStatus, setAuthStatus] = useState(copy.en.auth_status_setup)
  const [authUser, setAuthUser] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [authUid, setAuthUid] = useState<string | null>(null)
  const [registerStatus, setRegisterStatus] = useState('')
  const [registerLoading, setRegisterLoading] = useState(false)
  const [signInLoading, setSignInLoading] = useState(false)
  const [signInStatus, setSignInStatus] = useState('')
  const authRef = useRef<{ auth: Auth; provider: GoogleAuthProvider } | null>(
    null
  )
  const appRef = useRef<FirebaseApp | null>(null)
  const firestoreRef = useRef<ReturnType<typeof getFirestore> | null>(null)

  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const languageCopy = getCopy(lang)
  const isAdmin = authEmail?.toLowerCase() === 'b@bernhard-huber.eu'

  const firebaseConfigured = useMemo(
    () =>
      !Object.values(firebaseConfig).some((value) => value.startsWith('YOUR_')),
    []
  )

  useEffect(() => {
    if (!firebaseConfigured) {
      setAuthStatus(languageCopy.auth_status_config)
      return
    }

    const app = initializeApp(firebaseConfig)
    appRef.current = app
    const auth = getAuth(app)
    const provider = new GoogleAuthProvider()
    authRef.current = { auth, provider }
    firestoreRef.current = getFirestore(app)

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(user.displayName || 'User')
        setAuthEmail(user.email || null)
        setAuthUid(user.uid)
        setAuthStatus(languageCopy.auth_status_pending)
      } else {
        setAuthUser(null)
        setAuthEmail(null)
        setAuthUid(null)
        setAuthStatus(languageCopy.auth_status_pending)
      }
    })

    return () => unsubscribe()
  }, [firebaseConfigured, languageCopy.auth_status_pending, languageCopy.auth_status_config])

  useEffect(() => {
    const load = async () => {
      const [
        clubsData,
        websitesData,
        reviewsData,
        postsData,
        constellationsData,
        profilesData,
        eventsData,
      ] = await Promise.all([
        loadJson<Club[]>('/data/clubs.json'),
        loadJson<Website[]>('/data/websites.json'),
        loadJson<Review[]>('/data/reviews.json'),
        loadJson<Post[]>('/data/posts.json'),
        loadJson<Constellation[]>('/data/constellations.json'),
        loadJson<Profile[]>('/data/profiles.json'),
        loadJson<Event[]>('/data/events.json'),
      ])

      setClubs(clubsData ?? [])
      setWebsites(websitesData ?? [])
      setReviews(reviewsData ?? [])
      setPosts(postsData ?? [])
      setConstellations(constellationsData ?? [])
      setProfiles(profilesData ?? [])
      setEvents(eventsData ?? [])
    }

    load()
  }, [])

  useEffect(() => {
    if (!firebaseConfigured || !firestoreRef.current) {
      return
    }
    const db = firestoreRef.current
    const approvedQuery = query(
      collection(db, 'reviews_submitted'),
      where('status', '==', 'approved')
    )
    const unsubscribeApproved = onSnapshot(approvedQuery, (snapshot) => {
      const next = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        const createdAt = data.createdAt as { toDate?: () => Date } | undefined
        return {
          id: docSnap.id,
          club_slug: String(data.club_slug || ''),
          author_type: (data.author_type as 'user' | 'constellation') || 'user',
          author_slug: String(data.author_slug || 'anonymous'),
          rating: Number(data.rating || 0),
          status: String(data.status || 'approved'),
          text: String(data.text || ''),
          date: createdAt?.toDate?.()?.toISOString().slice(0, 10),
          city: data.club_city ? String(data.club_city) : undefined,
          country: data.club_country ? String(data.club_country) : undefined,
        } satisfies Review
      })
      setFirestoreReviews(next)
    })

    let unsubscribePending: (() => void) | null = null
    if (isAdmin) {
      const pendingQuery = query(
        collection(db, 'reviews_submitted'),
        where('status', '==', 'pending')
      )
      unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
        const next = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>
          const createdAt = data.createdAt as { toDate?: () => Date } | undefined
          return {
            id: docSnap.id,
            club_slug: String(data.club_slug || ''),
            author_type: (data.author_type as 'user' | 'constellation') || 'user',
            author_slug: String(data.author_slug || 'anonymous'),
            rating: Number(data.rating || 0),
            status: String(data.status || 'pending'),
            text: String(data.text || ''),
            date: createdAt?.toDate?.()?.toISOString().slice(0, 10),
            city: data.club_city ? String(data.club_city) : undefined,
            country: data.club_country ? String(data.club_country) : undefined,
          } satisfies Review
        })
        setPendingReviews(next)
      })
    } else {
      setPendingReviews([])
    }

    return () => {
      unsubscribeApproved()
      if (unsubscribePending) {
        unsubscribePending()
      }
    }
  }, [firebaseConfigured, isAdmin])

  useEffect(() => {
    if (!firebaseConfigured || !firestoreRef.current) {
      return
    }
    if (!isAdmin) {
      setVerificationRequests([])
      return
    }
    const db = firestoreRef.current
    const verificationQuery = query(
      collection(db, 'verification_requests'),
      where('status', '==', 'pending')
    )
    const unsubscribe = onSnapshot(verificationQuery, (snapshot) => {
      const next = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>
        const createdAt = data.created_at as { toDate?: () => Date } | undefined
        return {
          id: docSnap.id,
          user_uid: String(data.user_uid || ''),
          user_name: String(data.user_name || ''),
          user_email: String(data.user_email || ''),
          photo_url: String(data.photo_url || ''),
          phrase: String(data.phrase || ''),
          status: (data.status as VerificationRequest['status']) || 'pending',
          created_at: createdAt?.toDate?.()?.toISOString(),
        } satisfies VerificationRequest
      })
      setVerificationRequests(next)
    })

    return () => unsubscribe()
  }, [firebaseConfigured, isAdmin])

  useEffect(() => {
    if (!firebaseConfigured || !firestoreRef.current) {
      return
    }
    if (!isAdmin) {
      setPendingEventRsvps([])
      return
    }
    const db = firestoreRef.current
    const pendingRsvpsQuery = query(
      collection(db, 'event_rsvps'),
      where('status', '==', 'Pending')
    )
    const unsubscribe = onSnapshot(pendingRsvpsQuery, (snapshot) => {
      const next = snapshot.docs.map((docSnap) =>
        parseEventRsvp(docSnap.data() as Record<string, unknown>, docSnap.id)
      )
      setPendingEventRsvps(next)
    })

    return () => unsubscribe()
  }, [firebaseConfigured, isAdmin])

  useEffect(() => {
    if (!firebaseConfigured || !appRef.current) {
      return
    }
    const messaging = getMessaging(appRef.current)
    const unsubscribe = onMessage(messaging, (payload) => {
      console.info('Push message received', payload)
    })
    return () => unsubscribe()
  }, [firebaseConfigured])

  useEffect(() => {
    if (!firebaseConfigured || !firestoreRef.current || !authUid) {
      setLinksFromA([])
      setLinksFromB([])
      return
    }
    const db = firestoreRef.current
    const parseLink = (data: Record<string, unknown>, id: string) => ({
      id,
      user_a: String(data.user_a || ''),
      user_b: String(data.user_b || ''),
      link_type:
        (data.link_type as RelationshipLink['link_type']) || 'Polycule Member',
      status: (data.status as RelationshipLink['status']) || 'Pending',
      merge_visibility: Boolean(data.merge_visibility),
      user_a_name: typeof data.user_a_name === 'string' ? data.user_a_name : '',
      user_b_name: typeof data.user_b_name === 'string' ? data.user_b_name : '',
      user_a_email: typeof data.user_a_email === 'string' ? data.user_a_email : '',
      user_b_email: typeof data.user_b_email === 'string' ? data.user_b_email : '',
    })

    const queryA = query(
      collection(db, 'relationship_links'),
      where('user_a', '==', authUid)
    )
    const queryB = query(
      collection(db, 'relationship_links'),
      where('user_b', '==', authUid)
    )

    const unsubscribeA = onSnapshot(queryA, (snapshot) => {
      const next = snapshot.docs.map((docSnap) =>
        parseLink(docSnap.data() as Record<string, unknown>, docSnap.id)
      )
      setLinksFromA(next)
    })
    const unsubscribeB = onSnapshot(queryB, (snapshot) => {
      const next = snapshot.docs.map((docSnap) =>
        parseLink(docSnap.data() as Record<string, unknown>, docSnap.id)
      )
      setLinksFromB(next)
    })

    return () => {
      unsubscribeA()
      unsubscribeB()
    }
  }, [authUid, firebaseConfigured])

  useEffect(() => {
    if (!linksFromA.length && !linksFromB.length) {
      setRelationshipLinks([])
      return
    }
    const merged = new Map<string, RelationshipLink>()
    ;[...linksFromA, ...linksFromB].forEach((link) => {
      if (!link.id) {
        return
      }
      merged.set(link.id, link)
    })
    setRelationshipLinks(Array.from(merged.values()))
  }, [linksFromA, linksFromB])

  useRevealOnScroll([
    clubs,
    websites,
    reviews,
    posts,
    constellations,
    profiles,
    events,
    location.pathname,
  ])

  const clubNames = useMemo(() => {
    return clubs.reduce<Record<string, string>>((acc, club) => {
      acc[club.slug] = club.name
      return acc
    }, {})
  }, [clubs])

  const handleAuthClick = async () => {
    if (!authRef.current) {
      return
    }
    const { auth, provider } = authRef.current
    if (auth.currentUser) {
      await signOut(auth)
      return
    }
    await signInWithPopup(auth, provider)
  }

  const handleGoogleRegisterStart = async () => {
    if (!authRef.current) {
      const message = languageCopy.auth_status_config
      setRegisterStatus(message)
      return { ok: false, message }
    }
    setRegisterStatus('')
    try {
      const { auth, provider } = authRef.current
      let user = auth.currentUser
      if (!user) {
        const credential = await signInWithPopup(auth, provider)
        user = credential.user
      }
      if (!user) {
        const message = languageCopy.auth_sign_in_error
        setRegisterStatus(message)
        return { ok: false, message }
      }
      let birthDate = ''
      if (firestoreRef.current) {
        const userDoc = await getDoc(doc(firestoreRef.current, 'users', user.uid))
        if (userDoc.exists()) {
          const data = userDoc.data() as Record<string, unknown>
          if (typeof data.birthDate === 'string') {
            birthDate = data.birthDate
          }
        }
      }
      return {
        ok: true,
        user: {
          displayName: user.displayName || '',
          email: user.email || '',
        },
        birthDate,
      }
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.auth_sign_in_error
      setRegisterStatus(message)
      return { ok: false, message }
    }
  }

  const handleEmailSignIn = async ({
    email,
    password,
  }: {
    email: string
    password: string
  }) => {
    if (!authRef.current) {
      setSignInStatus(languageCopy.auth_status_config)
      return
    }
    if (!email.trim() || !password) {
      setSignInStatus(languageCopy.auth_sign_in_missing)
      return
    }
    setSignInLoading(true)
    setSignInStatus('')
    try {
      await signInWithEmailAndPassword(authRef.current.auth, email.trim(), password)
      setSignInStatus(languageCopy.auth_sign_in_success)
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.auth_sign_in_error
      setSignInStatus(message)
    } finally {
      setSignInLoading(false)
    }
  }

  const handleRegister = async ({
    displayName,
    email,
    password,
    birthDate,
    location,
    interests,
    consentAge,
    consentPrivacy,
    consentPolicy,
  }: {
    displayName: string
    email: string
    password: string
    birthDate: string
    location: string
    interests: string[]
    consentAge: boolean
    consentPrivacy: boolean
    consentPolicy: boolean
  }) => {
    if (!authRef.current || !firestoreRef.current) {
      setRegisterStatus(languageCopy.auth_status_config)
      return
    }
    setRegisterLoading(true)
    setRegisterStatus('')
    try {
      const { auth } = authRef.current
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      if (displayName) {
        await updateProfile(credential.user, { displayName })
      }
      await setDoc(doc(firestoreRef.current, 'users', credential.user.uid), {
        displayName,
        email,
        birthDate,
        location,
        interests,
        consentAge,
        consentPrivacy,
        consentPolicy,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      setAuthStatus(languageCopy.register_status_success)
      setRegisterStatus(languageCopy.register_status_success)
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.register_status_error
      if (message.toLowerCase().includes('permission')) {
        setRegisterStatus(languageCopy.register_status_permission)
      } else {
        setRegisterStatus(message)
      }
    } finally {
      setRegisterLoading(false)
    }
  }

  const handleGoogleRegister = async ({
    displayName,
    email,
    birthDate,
    location,
    interests,
    consentAge,
    consentPrivacy,
    consentPolicy,
  }: {
    displayName: string
    email: string
    birthDate: string
    location: string
    interests: string[]
    consentAge: boolean
    consentPrivacy: boolean
    consentPolicy: boolean
  }) => {
    if (!authRef.current || !firestoreRef.current) {
      setRegisterStatus(languageCopy.auth_status_config)
      return
    }
    const user = authRef.current.auth.currentUser
    if (!user) {
      setRegisterStatus(languageCopy.auth_sign_in_missing)
      return
    }
    setRegisterLoading(true)
    setRegisterStatus('')
    try {
      if (displayName && user.displayName !== displayName) {
        await updateProfile(user, { displayName })
      }
      const userDocRef = doc(firestoreRef.current, 'users', user.uid)
      const existingDoc = await getDoc(userDocRef)
      const payload = {
        displayName,
        email: user.email || email,
        birthDate,
        location,
        interests,
        consentAge,
        consentPrivacy,
        consentPolicy,
      }
      const payloadWithStatus = existingDoc.exists()
        ? payload
        : { ...payload, status: 'pending', createdAt: serverTimestamp() }
      await setDoc(userDocRef, payloadWithStatus, { merge: true })
      setAuthStatus(languageCopy.register_status_success)
      setRegisterStatus(languageCopy.register_status_success)
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.register_status_error
      if (message.toLowerCase().includes('permission')) {
        setRegisterStatus(languageCopy.register_status_permission)
      } else {
        setRegisterStatus(message)
      }
    } finally {
      setRegisterLoading(false)
    }
  }

  const handleReviewSubmit = async ({
    club,
    rating,
    text,
    anonymous = false,
  }: {
    club: Club
    rating: number
    text: string
    anonymous?: boolean
  }) => {
    if (!authRef.current || !firestoreRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    const user = authRef.current.auth.currentUser
    if (!user) {
      return { ok: false, message: languageCopy.review_signin_required }
    }
    if (!text.trim()) {
      return { ok: false, message: languageCopy.review_status_error }
    }
    try {
      const authorLabel = anonymous
        ? languageCopy.review_author_anonymous
        : user.displayName || user.email || 'member'
      await addDoc(collection(firestoreRef.current, 'reviews_submitted'), {
        club_slug: club.slug,
        club_name: club.name,
        club_city: club.city || null,
        club_country: club.country || null,
        rating,
        text: text.trim(),
        status: 'pending',
        author_type: 'user',
        author_uid: user.uid,
        author_slug: slugify(authorLabel),
        createdAt: serverTimestamp(),
      })
      return { ok: true, message: languageCopy.review_status_pending }
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.review_status_error
      if (message.toLowerCase().includes('permission')) {
        return {
          ok: false,
          message: languageCopy.review_permission_error,
        }
      }
      return { ok: false, message }
    }
  }

  const handleClubSubmit = async ({
    name,
    city,
    country,
    website,
    summary,
  }: {
    name: string
    city: string
    country: string
    website: string
    summary: string
  }) => {
    if (!authRef.current || !firestoreRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    const user = authRef.current.auth.currentUser
    if (!user) {
      return { ok: false, message: languageCopy.club_submit_signin_required }
    }
    if (!name.trim()) {
      return { ok: false, message: languageCopy.club_submit_status_error }
    }
    try {
      const normalizedName = name.trim()
      await addDoc(collection(firestoreRef.current, 'clubs_submitted'), {
        name: normalizedName,
        slug: slugify(normalizedName),
        city: city.trim() || null,
        country: country.trim() || null,
        website: website.trim() || null,
        summary: summary.trim() || null,
        status: 'pending',
        author_uid: user.uid,
        author_email: user.email || null,
        author_name: user.displayName || null,
        createdAt: serverTimestamp(),
      })
      return { ok: true, message: languageCopy.club_submit_status_pending }
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.club_submit_status_error
      if (message.toLowerCase().includes('permission')) {
        return { ok: false, message: languageCopy.club_submit_permission_error }
      }
      return { ok: false, message }
    }
  }

  const handleProfileLoad = async () => {
    if (!authRef.current || !firestoreRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    const user = authRef.current.auth.currentUser
    if (!user) {
      return { ok: false, message: languageCopy.review_signin_required }
    }
    const userDoc = await getDoc(doc(firestoreRef.current, 'users', user.uid))
    if (!userDoc.exists()) {
      return {
        ok: true,
        data: {
          displayName: user.displayName || '',
          birthDate: '',
          location: '',
          locationLat: '',
          locationLng: '',
          interests: [],
          consentPrivacy: true,
          photoUrl: '',
        },
      }
    }
    const data = userDoc.data() as Record<string, unknown>
    return {
      ok: true,
      data: {
        displayName: String(data.displayName || user.displayName || ''),
        birthDate: typeof data.birthDate === 'string' ? data.birthDate : '',
        location: typeof data.location === 'string' ? data.location : '',
        locationLat:
          typeof data.locationLat === 'number' ? String(data.locationLat) : '',
        locationLng:
          typeof data.locationLng === 'number' ? String(data.locationLng) : '',
        interests: Array.isArray(data.interests)
          ? data.interests.map((item) => String(item))
          : [],
        consentPrivacy:
          typeof data.consentPrivacy === 'boolean' ? data.consentPrivacy : true,
        photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : '',
      },
    }
  }

  const handleProfileUpdate = async ({
    displayName,
    birthDate,
    location,
    locationLat,
    locationLng,
    interests,
    consentPrivacy,
  }: {
    displayName: string
    birthDate: string
    location: string
    locationLat: string
    locationLng: string
    interests: string[]
    consentPrivacy: boolean
  }) => {
    if (!authRef.current || !firestoreRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    const user = authRef.current.auth.currentUser
    if (!user) {
      return { ok: false, message: languageCopy.review_signin_required }
    }
    try {
      if (displayName && user.displayName !== displayName) {
        await updateProfile(user, { displayName })
        setAuthUser(displayName)
      }
      const parsedLat = Number.parseFloat(locationLat)
      const parsedLng = Number.parseFloat(locationLng)
      const hasCoords =
        Number.isFinite(parsedLat) &&
        Number.isFinite(parsedLng) &&
        Math.abs(parsedLat) <= 90 &&
        Math.abs(parsedLng) <= 180
      await setDoc(
        doc(firestoreRef.current, 'users', user.uid),
        {
          displayName,
          email: user.email || '',
          birthDate,
          location,
          locationLat: hasCoords ? parsedLat : null,
          locationLng: hasCoords ? parsedLng : null,
          locationFuzzyLat: hasCoords ? fuzzCoordinate(parsedLat) : null,
          locationFuzzyLng: hasCoords ? fuzzCoordinate(parsedLng) : null,
          interests,
          consentPrivacy,
        },
        { merge: true }
      )
      return { ok: true, message: languageCopy.profile_saved }
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.profile_save_error
      return { ok: false, message }
    }
  }

  const uploadImage = async (file: File) => {
    if (!authRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    const user = authRef.current.auth.currentUser
    if (!user) {
      return { ok: false, message: languageCopy.review_signin_required }
    }
    try {
      const token = await user.getIdToken()
      const formData = new FormData()
      formData.append('photo', file)
      const response = await fetch('/api/uploads', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })
      if (!response.ok) {
        return { ok: false, message: languageCopy.photo_upload_error }
      }
      const data = (await response.json()) as { url?: string }
      if (!data.url) {
        return { ok: false, message: languageCopy.photo_upload_error }
      }
      return { ok: true, url: data.url, message: languageCopy.photo_upload_success }
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.photo_upload_error
      return { ok: false, message }
    }
  }

  const handlePhotoUpload = async (file: File) => {
    if (!firestoreRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    const user = authRef.current?.auth.currentUser
    if (!user) {
      return { ok: false, message: languageCopy.review_signin_required }
    }
    const upload = await uploadImage(file)
    if (!upload.ok || !upload.url) {
      return { ok: false, message: upload.message }
    }
    await setDoc(
      doc(firestoreRef.current, 'users', user.uid),
      { photoUrl: upload.url },
      { merge: true }
    )
    return { ok: true, url: upload.url, message: languageCopy.photo_upload_success }
  }

  const handleVerificationSubmit = async (file: File) => {
    if (!firestoreRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    const user = authRef.current?.auth.currentUser
    if (!user) {
      return { ok: false, message: languageCopy.review_signin_required }
    }
    const upload = await uploadImage(file)
    if (!upload.ok || !upload.url) {
      return { ok: false, message: languageCopy.verification_status_error }
    }
    await addDoc(collection(firestoreRef.current, 'verification_requests'), {
      user_uid: user.uid,
      user_name: user.displayName || user.email || 'member',
      user_email: user.email || '',
      photo_url: upload.url,
      phrase: languageCopy.verification_phrase,
      status: 'pending',
      created_at: serverTimestamp(),
    })
    return { ok: true, message: languageCopy.verification_status_pending }
  }

  const handleNotificationsEnable = async () => {
    if (!appRef.current || !firestoreRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    if (typeof Notification === 'undefined') {
      return { ok: false, message: languageCopy.notifications_error }
    }
    if (Notification.permission === 'denied') {
      return { ok: false, message: languageCopy.notifications_blocked }
    }
    if (!('serviceWorker' in navigator)) {
      return { ok: false, message: languageCopy.notifications_error }
    }
    const user = authRef.current?.auth.currentUser
    if (!user) {
      return { ok: false, message: languageCopy.review_signin_required }
    }
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
    if (!vapidKey) {
      return { ok: false, message: languageCopy.notifications_missing_key }
    }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { ok: false, message: languageCopy.notifications_blocked }
    }
    try {
      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js'
      )
      const messaging = getMessaging(appRef.current)
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      })
      if (!token) {
        return { ok: false, message: languageCopy.notifications_error }
      }
      const userRef = doc(firestoreRef.current, 'users', user.uid)
      const userDoc = await getDoc(userRef)
      const existing = userDoc.exists()
        ? (userDoc.data() as Record<string, unknown>)
        : {}
      const tokens = Array.isArray(existing.notificationTokens)
        ? existing.notificationTokens.map((value) => String(value))
        : []
      const nextTokens = Array.from(new Set([...tokens, token]))
      await setDoc(
        userRef,
        { notificationTokens: nextTokens, notificationsEnabled: true },
        { merge: true }
      )
      return { ok: true, message: languageCopy.notifications_enabled, token }
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.notifications_error
      return { ok: false, message }
    }
  }

  const handleNotificationsDisable = async () => {
    if (!appRef.current || !firestoreRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    if (typeof Notification === 'undefined') {
      return { ok: false, message: languageCopy.notifications_error }
    }
    if (!('serviceWorker' in navigator)) {
      return { ok: false, message: languageCopy.notifications_error }
    }
    const user = authRef.current?.auth.currentUser
    if (!user) {
      return { ok: false, message: languageCopy.review_signin_required }
    }
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
    if (!vapidKey) {
      return { ok: false, message: languageCopy.notifications_missing_key }
    }
    try {
      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js'
      )
      const messaging = getMessaging(appRef.current)
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      })
      if (token) {
        await deleteToken(messaging)
      }
      const userRef = doc(firestoreRef.current, 'users', user.uid)
      const userDoc = await getDoc(userRef)
      const existing = userDoc.exists()
        ? (userDoc.data() as Record<string, unknown>)
        : {}
      const tokens = Array.isArray(existing.notificationTokens)
        ? existing.notificationTokens.map((value) => String(value))
        : []
      const nextTokens = token ? tokens.filter((item) => item !== token) : tokens
      await setDoc(
        userRef,
        { notificationTokens: nextTokens, notificationsEnabled: false },
        { merge: true }
      )
      return { ok: true, message: languageCopy.notifications_disabled }
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.notifications_error
      return { ok: false, message }
    }
  }

  const handleLinkRequest = async ({
    email,
    linkType,
  }: {
    email: string
    linkType: RelationshipLink['link_type']
  }) => {
    if (!authRef.current || !firestoreRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      return { ok: false, message: languageCopy.link_request_status_missing }
    }
    const user = authRef.current.auth.currentUser
    if (!user || !user.email) {
      return { ok: false, message: languageCopy.review_signin_required }
    }
    if (trimmedEmail === user.email.toLowerCase()) {
      return { ok: false, message: languageCopy.link_request_status_self }
    }

    const db = firestoreRef.current
    try {
      const userQuery = query(collection(db, 'users'), where('email', '==', trimmedEmail))
      const userSnapshot = await getDocs(userQuery)
      if (userSnapshot.empty) {
        return { ok: false, message: languageCopy.link_request_status_not_found }
      }
      const targetDoc = userSnapshot.docs[0]
      const targetUid = targetDoc.id
      if (targetUid === user.uid) {
        return { ok: false, message: languageCopy.link_request_status_self }
      }
      const existingA = await getDocs(
        query(
          collection(db, 'relationship_links'),
          where('user_a', '==', user.uid),
          where('user_b', '==', targetUid)
        )
      )
      const existingB = await getDocs(
        query(
          collection(db, 'relationship_links'),
          where('user_a', '==', targetUid),
          where('user_b', '==', user.uid)
        )
      )
      if (!existingA.empty || !existingB.empty) {
        return { ok: false, message: languageCopy.link_request_status_exists }
      }
      const targetData = targetDoc.data() as Record<string, unknown>
      await addDoc(collection(db, 'relationship_links'), {
        user_a: user.uid,
        user_b: targetUid,
        user_a_name: user.displayName || '',
        user_b_name: typeof targetData.displayName === 'string' ? targetData.displayName : '',
        user_a_email: user.email,
        user_b_email:
          typeof targetData.email === 'string' ? targetData.email : trimmedEmail,
        link_type: linkType,
        status: 'Pending',
        merge_visibility: false,
        createdAt: serverTimestamp(),
      })
      return { ok: true, message: languageCopy.link_request_status_sent }
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.link_request_status_error
      return { ok: false, message }
    }
  }

  const handleLinkResponse = async (
    linkId: string,
    status: 'Confirmed' | 'Rejected'
  ) => {
    if (!firestoreRef.current || !authUid) {
      return
    }
    await updateDoc(doc(firestoreRef.current, 'relationship_links', linkId), {
      status,
      respondedAt: serverTimestamp(),
      respondedBy: authUid,
    })
  }

  const handleLinkVisibility = async (linkId: string, mergeVisibility: boolean) => {
    if (!firestoreRef.current || !authUid) {
      return
    }
    await updateDoc(doc(firestoreRef.current, 'relationship_links', linkId), {
      merge_visibility: mergeVisibility,
      updatedAt: serverTimestamp(),
      updatedBy: authUid,
    })
  }

  const subscribeEventRsvps = (
    eventSlug: string,
    onUpdate: (rsvps: EventRsvp[]) => void
  ) => {
    if (!firestoreRef.current) {
      return null
    }
    const db = firestoreRef.current
    const rsvpQuery = query(
      collection(db, 'event_rsvps'),
      where('event_slug', '==', eventSlug)
    )
    return onSnapshot(rsvpQuery, (snapshot) => {
      const next = snapshot.docs.map((docSnap) =>
        parseEventRsvp(docSnap.data() as Record<string, unknown>, docSnap.id)
      )
      onUpdate(next)
    })
  }

  const handleEventRsvpSubmit = async (event: Event, category: keyof EventCap) => {
    if (!authRef.current || !firestoreRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    const user = authRef.current.auth.currentUser
    if (!user || !user.email) {
      return { ok: false, message: languageCopy.event_rsvp_signed_out }
    }
    try {
      const existing = await getDocs(
        query(
          collection(firestoreRef.current, 'event_rsvps'),
          where('event_slug', '==', event.slug),
          where('user_uid', '==', user.uid)
        )
      )
      if (!existing.empty) {
        return { ok: true, message: languageCopy.event_rsvp_pending }
      }
      const userDoc = await getDoc(doc(firestoreRef.current, 'users', user.uid))
      const data = userDoc.exists()
        ? (userDoc.data() as Record<string, unknown>)
        : null
      const trustBadges = data && Array.isArray(data.trustBadges)
        ? data.trustBadges.map((badge) => String(badge))
        : []
      const status = event.privacy_tier === 'Public' ? 'Approved' : 'Pending'
      await addDoc(collection(firestoreRef.current, 'event_rsvps'), {
        event_slug: event.slug,
        user_uid: user.uid,
        user_name: user.displayName || user.email,
        user_email: user.email,
        category,
        status,
        trust_badges: trustBadges,
        checkin_token: generateCheckinToken(),
        host_email: event.host_email,
        created_at: serverTimestamp(),
      })
      const message =
        status === 'Approved'
          ? languageCopy.event_rsvp_approved
          : languageCopy.event_rsvp_pending
      return { ok: true, message }
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.event_rsvp_error
      return { ok: false, message }
    }
  }

  const handleEventRsvpUpdate = async (
    rsvpId: string,
    status: 'Approved' | 'Declined'
  ) => {
    if (!firestoreRef.current) {
      return
    }
    await updateDoc(doc(firestoreRef.current, 'event_rsvps', rsvpId), {
      status,
      reviewed_at: serverTimestamp(),
      reviewed_by: authEmail || '',
    })
  }

  const allReviews = useMemo(
    () => [...reviews, ...firestoreReviews],
    [reviews, firestoreReviews]
  )

  const pendingLinkRequests = useMemo(
    () =>
      relationshipLinks.filter(
        (link) => link.status === 'Pending' && link.user_b === authUid
      ),
    [relationshipLinks, authUid]
  )

  const handleReviewModeration = async (
    reviewId: string,
    status: 'approved' | 'rejected'
  ) => {
    if (!firestoreRef.current || !authEmail) {
      return
    }
    await updateDoc(doc(firestoreRef.current, 'reviews_submitted', reviewId), {
      status,
      reviewedAt: serverTimestamp(),
      reviewedBy: authEmail,
    })
  }

  const handleVerificationModeration = async (
    requestId: string,
    status: 'approved' | 'rejected'
  ) => {
    if (!firestoreRef.current || !authEmail) {
      return
    }
    await updateDoc(
      doc(firestoreRef.current, 'verification_requests', requestId),
      {
        status,
        reviewedAt: serverTimestamp(),
        reviewedBy: authEmail,
      }
    )
  }

  const context: AppContext = {
    clubs,
    websites,
    posts,
    reviews: allReviews,
    constellations,
    profiles,
    events,
    relationshipLinks,
    pendingLinkRequests,
    verificationRequests,
    clubNames,
    authStatus,
    authUser,
    authEmail,
    authUid,
    handleAuthClick,
    handleEmailSignIn,
    handleGoogleRegisterStart,
    handleRegister,
    handleGoogleRegister,
    registerStatus,
    signInStatus,
    registerLoading,
    signInLoading,
    handleReviewSubmit,
    handleClubSubmit,
    handleReviewModeration,
    pendingReviews,
    pendingEventRsvps,
    isAdmin,
    firebaseConfigured,
    handleProfileLoad,
    handleProfileUpdate,
    handlePhotoUpload,
    handleNotificationsEnable,
    handleNotificationsDisable,
    handleVerificationSubmit,
    handleVerificationModeration,
    handleLinkRequest,
    handleLinkResponse,
    handleLinkVisibility,
    subscribeEventRsvps,
    handleEventRsvpSubmit,
    handleEventRsvpUpdate,
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/en" replace />} />
      {SUPPORTED_LANGS.map((language) => (
        <Route key={language} path={`/${language}`} element={<SiteLayout context={context} />}>
          <Route index element={<HomePage />} />
          <Route path="clubs" element={<ClubsPage />} />
          <Route path="clubs/:slug" element={<ClubDetail />} />
          <Route path="events/host" element={<HostDashboard />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/:slug" element={<EventDetail />} />
          <Route path="cities/:citySlug" element={<CityPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="blog" element={<BlogPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="profiles/:slug" element={<PublicProfilePage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="guidelines" element={<GuidelinesPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
      ))}
      <Route path="*" element={<Navigate to="/en" replace />} />
    </Routes>
  )
}

export default App
