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
import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
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
  addDoc,
  collection,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import L from 'leaflet'

const firebaseConfig = {
  apiKey: 'AIzaSyCCIsslSCpOwkHhvFfK41noNkplEcw0pfk',
  authDomain: 'ledbyswing.firebaseapp.com',
  projectId: 'ledbyswing',
  storageBucket: 'ledbyswing.firebasestorage.app',
  messagingSenderId: '68542676788',
  appId: '1:68542676788:web:a3f793148639c8f006ef61',
}

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
  summary: string
}

type Website = {
  name: string
  url: string
  type: string
  status: string
  summary: string
}

type Post = {
  title: string
  date: string
  excerpt: string
  meta: [string, string]
}

type Constellation = {
  name: string
  slug: string
  city?: string
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
  clubNames: Record<string, string>
  authStatus: string
  authUser: string | null
  handleAuthClick: () => Promise<void>
  handleRegister: (details: {
    displayName: string
    email: string
    password: string
    location: string
    interests: string[]
    consentAge: boolean
    consentPrivacy: boolean
    consentPolicy: boolean
  }) => Promise<void>
  registerStatus: string
  registerLoading: boolean
  handleReviewSubmit: (details: {
    club: Club
    rating: number
    text: string
  }) => Promise<{ ok: boolean; message: string }>
  handleReviewModeration: (reviewId: string, status: 'approved' | 'rejected') => Promise<void>
  pendingReviews: Review[]
  isAdmin: boolean
  firebaseConfigured: boolean
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

const copy = {
  en: {
    site_tagline: 'Modern communities mapped like constellations.',
    nav_users: 'Users',
    nav_constellations: 'Constellations',
    nav_clubs: 'Clubs',
    nav_map: 'Map',
    nav_websites: 'Websites',
    nav_blog: 'Blog',
    nav_join: 'Join',
    nav_review: 'Review',
    nav_admin: 'Admin',
    request_access: 'Request Access',
    footer_tagline: 'Community home for users, constellations, clubs, and stories.',
    footer_docs: 'Read the docs',
    footer_start_club: 'Start a club',
    lang_select_label: 'Select language',
    hero_pill: 'Built for creators, clubs, and shared stories',
    hero_title: 'Shape a living network of people, clubs, and unforgettable nights.',
    hero_lead:
      'LedBySwing brings together people, constellations, and clubs with room to share stories, reviews, and travel diaries.',
    hero_cta_primary: 'Launch a constellation',
    hero_cta_secondary: 'Explore the graph',
    metric_label: 'Active users',
    metric_caption: 'Growing in 12 regions',
    register_page_title: 'Create your account',
    register_page_subtitle:
      'Complete your profile and request approval to publish reviews.',
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
    label_location: 'Location',
    label_interests: 'Interests',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ characters',
    placeholder_confirm_password: 'Re-enter password',
    placeholder_location: 'City, Country',
    placeholder_interests: 'Open relationships, Voyeur, BDSM',
    interest_tag_1: 'Open relationships',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Social events',
    consent_age: 'I confirm I am 18+ and consent to community guidelines.',
    consent_privacy: 'Keep my profile private until I choose to publish.',
    consent_policy: 'I agree to the Code of Conduct and review policy.',
    register_create: 'Create account',
    register_creating: 'Creating account...',
    auth_sign_in_google: 'Sign in with Google',
    auth_sign_out: 'Sign out',
    auth_status_setup: 'Sign-in setup required',
    auth_status_config: 'Sign-in configuration required',
    auth_status_pending: 'New accounts are reviewed before launch',
    register_password_mismatch: 'Passwords do not match.',
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
    users_title: 'Users',
    users_subtitle: 'Profiles, roles, and shared activity that power every constellation.',
    users_card_profiles_title: 'Profiles',
    users_card_profiles_body: 'Profiles with roles, pronouns, and shared interests.',
    users_card_profiles_item1: 'Custom tags',
    users_card_profiles_item2: 'Availability status',
    users_card_profiles_item3: 'Shared interests',
    users_card_trust_title: 'Community trust',
    users_card_trust_body: 'Momentum grows when members contribute and share stories.',
    users_card_trust_item1: 'Peer endorsements',
    users_card_trust_item2: 'Event attendance',
    users_card_trust_item3: 'Story impact',
    users_card_privacy_title: 'Privacy choices',
    users_card_privacy_body: 'Choose how visible you are across clubs and constellations.',
    users_card_privacy_item1: 'Per-club visibility',
    users_card_privacy_item2: 'Story gating',
    users_card_privacy_item3: 'Activity masking',
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
    clubs_page_title: 'Clubs',
    clubs_page_desc:
      'Browse every club, then open a detail page for reviews and stories.',
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
    nav_map: 'Mapa',
    nav_websites: 'Strony',
    nav_blog: 'Blog',
    nav_join: 'Dołącz',
    nav_review: 'Recenzje',
    nav_admin: 'Admin',
    request_access: 'Poproś o dostęp',
    footer_tagline: 'Dom społeczności dla użytkowników, konstelacji, klubów i historii.',
    footer_docs: 'Czytaj dokumentację',
    footer_start_club: 'Załóż klub',
    lang_select_label: 'Wybierz język',
    hero_pill: 'Dla twórców, klubów i wspólnych historii',
    hero_title: 'Twórz żywą sieć ludzi, klubów i niezapomnianych nocy.',
    hero_lead:
      'LedBySwing łączy ludzi, konstelacje i kluby, dając miejsce na historie, recenzje i dzienniki podróży.',
    hero_cta_primary: 'Uruchom konstelację',
    hero_cta_secondary: 'Poznaj sieć',
    metric_label: 'Aktywni użytkownicy',
    metric_caption: 'Wzrost w 12 regionach',
    register_page_title: 'Załóż konto',
    register_page_subtitle:
      'Uzupełnij profil i poproś o zgodę na publikację recenzji.',
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
    label_location: 'Lokalizacja',
    label_interests: 'Zainteresowania',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ znaków',
    placeholder_confirm_password: 'Wpisz ponownie hasło',
    placeholder_location: 'Miasto, kraj',
    placeholder_interests: 'Relacje otwarte, Voyeur, BDSM',
    interest_tag_1: 'Relacje otwarte',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Wydarzenia społeczne',
    consent_age: 'Potwierdzam, że mam 18+ i akceptuję zasady społeczności.',
    consent_privacy: 'Zachowaj mój profil prywatny do czasu publikacji.',
    consent_policy: 'Akceptuję Kodeks Postępowania i politykę recenzji.',
    register_create: 'Utwórz konto',
    register_creating: 'Tworzenie konta...',
    auth_sign_in_google: 'Zaloguj przez Google',
    auth_sign_out: 'Wyloguj',
    auth_status_setup: 'Wymagana konfiguracja logowania',
    auth_status_config: 'Wymagana konfiguracja logowania',
    auth_status_pending: 'Nowe konta są weryfikowane przed publikacją',
    register_password_mismatch: 'Hasła nie są zgodne.',
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
    clubs_page_title: 'Kluby',
    clubs_page_desc: 'Przeglądaj kluby i otwieraj szczegóły.',
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
    nav_map: 'Carte',
    nav_websites: 'Sites',
    nav_blog: 'Blog',
    nav_join: 'Rejoindre',
    nav_review: 'Avis',
    nav_admin: 'Admin',
    request_access: "Demander l'accès",
    footer_tagline: 'Maison de la communauté pour utilisateurs, constellations, clubs et histoires.',
    footer_docs: 'Lire la doc',
    footer_start_club: 'Démarrer un club',
    lang_select_label: 'Choisir la langue',
    hero_pill: 'Pour les créateurs, les clubs et les histoires partagées',
    hero_title: 'Façonnez un réseau vivant de personnes, de clubs et de nuits inoubliables.',
    hero_lead:
      'LedBySwing réunit personnes, constellations et clubs pour partager histoires, avis et carnets de voyage.',
    hero_cta_primary: 'Lancer une constellation',
    hero_cta_secondary: 'Explorer le graphe',
    metric_label: 'Utilisateurs actifs',
    metric_caption: 'En croissance dans 12 régions',
    register_page_title: 'Créer votre compte',
    register_page_subtitle:
      'Complétez votre profil et demandez la validation pour publier.',
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
    label_location: 'Localisation',
    label_interests: 'Intérêts',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ caractères',
    placeholder_confirm_password: 'Ressaisir le mot de passe',
    placeholder_location: 'Ville, pays',
    placeholder_interests: 'Relations ouvertes, Voyeur, BDSM',
    interest_tag_1: 'Relations ouvertes',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Événements sociaux',
    consent_age: "Je confirme avoir 18+ et accepter les règles.",
    consent_privacy: 'Garder mon profil privé jusqu’à publication.',
    consent_policy: "J'accepte le Code de conduite et la politique d'avis.",
    register_create: 'Créer un compte',
    register_creating: 'Création...',
    auth_sign_in_google: 'Se connecter avec Google',
    auth_sign_out: 'Se déconnecter',
    auth_status_setup: 'Configuration requise',
    auth_status_config: 'Configuration requise',
    auth_status_pending: 'Les nouveaux comptes sont vérifiés avant publication',
    register_password_mismatch: 'Les mots de passe ne correspondent pas.',
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
    clubs_page_title: 'Clubs',
    clubs_page_desc: 'Parcourez tous les clubs et leurs avis.',
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
    nav_map: 'Karte',
    nav_websites: 'Websites',
    nav_blog: 'Blog',
    nav_join: 'Beitreten',
    nav_review: 'Reviews',
    nav_admin: 'Admin',
    request_access: 'Zugang anfordern',
    footer_tagline: 'Community-Zuhause für Nutzer, Konstellationen, Clubs und Stories.',
    footer_docs: 'Doku lesen',
    footer_start_club: 'Club starten',
    lang_select_label: 'Sprache wählen',
    hero_pill: 'Für Creator, Clubs und gemeinsame Geschichten',
    hero_title: 'Forme ein lebendiges Netzwerk aus Menschen, Clubs und Nächten.',
    hero_lead:
      'LedBySwing verbindet Menschen, Konstellationen und Clubs für Stories, Reviews und Reisetagebücher.',
    hero_cta_primary: 'Konstellation starten',
    hero_cta_secondary: 'Netz erkunden',
    metric_label: 'Aktive Nutzer',
    metric_caption: 'Wächst in 12 Regionen',
    register_page_title: 'Konto erstellen',
    register_page_subtitle:
      'Profil vervollständigen und Freigabe zum Veröffentlichen anfordern.',
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
    label_location: 'Ort',
    label_interests: 'Interessen',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ Zeichen',
    placeholder_confirm_password: 'Passwort erneut',
    placeholder_location: 'Stadt, Land',
    placeholder_interests: 'Offene Beziehungen, Voyeur, BDSM',
    interest_tag_1: 'Offene Beziehungen',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Social Events',
    consent_age: 'Ich bestätige, dass ich 18+ bin und die Regeln akzeptiere.',
    consent_privacy: 'Profil privat halten, bis ich es veröffentliche.',
    consent_policy: 'Ich stimme dem Verhaltenskodex und der Review-Policy zu.',
    register_create: 'Konto erstellen',
    register_creating: 'Konto wird erstellt...',
    auth_sign_in_google: 'Mit Google anmelden',
    auth_sign_out: 'Abmelden',
    auth_status_setup: 'Anmeldung muss konfiguriert werden',
    auth_status_config: 'Anmeldung muss konfiguriert werden',
    auth_status_pending: 'Neue Konten werden vor Veröffentlichung geprüft',
    register_password_mismatch: 'Passwörter stimmen nicht überein.',
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
    clubs_page_title: 'Clubs',
    clubs_page_desc: 'Alle Clubs durchsuchen und Details öffnen.',
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
    nav_map: 'Mappa',
    nav_websites: 'Siti',
    nav_blog: 'Blog',
    nav_join: 'Unisciti',
    nav_review: 'Recensioni',
    nav_admin: 'Admin',
    request_access: 'Richiedi accesso',
    footer_tagline: 'Casa della community per utenti, costellazioni, club e storie.',
    footer_docs: 'Leggi la documentazione',
    footer_start_club: 'Avvia un club',
    lang_select_label: 'Seleziona lingua',
    hero_pill: 'Per creator, club e storie condivise',
    hero_title: 'Crea una rete viva di persone, club e notti indimenticabili.',
    hero_lead:
      'LedBySwing unisce persone, costellazioni e club per storie, recensioni e diari di viaggio.',
    hero_cta_primary: 'Lancia una costellazione',
    hero_cta_secondary: 'Esplora il grafo',
    metric_label: 'Utenti attivi',
    metric_caption: 'In crescita in 12 regioni',
    register_page_title: 'Crea il tuo account',
    register_page_subtitle:
      'Completa il profilo e richiedi l’approvazione per pubblicare.',
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
    label_location: 'Località',
    label_interests: 'Interessi',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ caratteri',
    placeholder_confirm_password: 'Reinserisci la password',
    placeholder_location: 'Città, Paese',
    placeholder_interests: 'Relazioni aperte, Voyeur, BDSM',
    interest_tag_1: 'Relazioni aperte',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Eventi sociali',
    consent_age: 'Confermo di avere 18+ e accetto le linee guida.',
    consent_privacy: 'Mantieni il profilo privato finché non pubblico.',
    consent_policy: 'Accetto il Codice di condotta e la policy.',
    register_create: 'Crea account',
    register_creating: 'Creazione...',
    auth_sign_in_google: 'Accedi con Google',
    auth_sign_out: 'Esci',
    auth_status_setup: 'Configurazione accesso richiesta',
    auth_status_config: 'Configurazione accesso richiesta',
    auth_status_pending: 'I nuovi account vengono verificati prima della pubblicazione',
    register_password_mismatch: 'Le password non corrispondono.',
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
    clubs_page_title: 'Club',
    clubs_page_desc: 'Sfoglia i club e apri i dettagli.',
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
    nav_map: 'Mapa',
    nav_websites: 'Sitios',
    nav_blog: 'Blog',
    nav_join: 'Unirse',
    nav_review: 'Reseñas',
    nav_admin: 'Admin',
    request_access: 'Solicitar acceso',
    footer_tagline: 'Hogar de la comunidad para usuarios, constelaciones, clubes e historias.',
    footer_docs: 'Leer la documentación',
    footer_start_club: 'Crear un club',
    lang_select_label: 'Seleccionar idioma',
    hero_pill: 'Para creadores, clubes e historias compartidas',
    hero_title: 'Crea una red viva de personas, clubes y noches inolvidables.',
    hero_lead:
      'LedBySwing conecta personas, constelaciones y clubes para historias, reseñas y diarios de viaje.',
    hero_cta_primary: 'Lanzar una constelación',
    hero_cta_secondary: 'Explorar la red',
    metric_label: 'Usuarios activos',
    metric_caption: 'Creciendo en 12 regiones',
    register_page_title: 'Crea tu cuenta',
    register_page_subtitle:
      'Completa tu perfil y solicita aprobación para publicar reseñas.',
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
    label_location: 'Ubicación',
    label_interests: 'Intereses',
    placeholder_display_name: 'VelvetAtlas',
    placeholder_email: 'name@email.com',
    placeholder_password: '8+ caracteres',
    placeholder_confirm_password: 'Repite la contraseña',
    placeholder_location: 'Ciudad, país',
    placeholder_interests: 'Relaciones abiertas, Voyeur, BDSM',
    interest_tag_1: 'Relaciones abiertas',
    interest_tag_2: 'Voyeur',
    interest_tag_3: 'BDSM',
    interest_tag_4: 'Eventos sociales',
    consent_age: 'Confirmo que tengo 18+ y acepto las normas.',
    consent_privacy: 'Mantener mi perfil privado hasta publicarlo.',
    consent_policy: 'Acepto el Código de Conducta y la política de reseñas.',
    register_create: 'Crear cuenta',
    register_creating: 'Creando...',
    auth_sign_in_google: 'Iniciar sesión con Google',
    auth_sign_out: 'Cerrar sesión',
    auth_status_setup: 'Se requiere configuración de acceso',
    auth_status_config: 'Se requiere configuración de acceso',
    auth_status_pending: 'Las nuevas cuentas se revisan antes de publicarse',
    register_password_mismatch: 'Las contraseñas no coinciden.',
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
    clubs_page_title: 'Clubes',
    clubs_page_desc: 'Explora clubes y abre los detalles.',
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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

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

const SiteLayout = ({ context }: { context: AppContext }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const lang = getLangFromPath(location.pathname)
  const [langValue, setLangValue] = useState(lang)
  const copy = getCopy(lang)
  const { isAdmin } = context

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
          <span className="brand-mark"></span>
          <div>
            <p className="eyebrow">LedBySwing</p>
            <h1>{copy.site_tagline}</h1>
          </div>
        </Link>
        <nav className="nav">
          <a href={`/${lang}#users`}>{copy.nav_users}</a>
          <a href={`/${lang}#constellations`}>{copy.nav_constellations}</a>
          <Link to={`/${lang}/clubs`}>{copy.nav_clubs}</Link>
          <a href={`/${lang}#map`}>{copy.nav_map}</a>
          <a href={`/${lang}#websites`}>{copy.nav_websites}</a>
          <a href={`/${lang}#blog`}>{copy.nav_blog}</a>
          <Link to={`/${lang}/register`}>{copy.nav_join}</Link>
          <a href={`/${lang}#moderation`}>{copy.nav_review}</a>
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
          <Link className="cta" to={`/${lang}/register`}>
            {copy.request_access}
          </Link>
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
          <button className="ghost">{copy.footer_docs}</button>
          <button className="cta">{copy.footer_start_club}</button>
        </div>
      </footer>
    </div>
  )
}

const HomePage = () => {
  const {
    clubs,
    websites,
    posts,
    pendingReviews,
    isAdmin,
    firebaseConfigured,
  } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="pill">{copy.hero_pill}</p>
          <h2>{copy.hero_title}</h2>
          <p className="lead">
            {copy.hero_lead}
          </p>
          <div className="hero-actions">
            <Link className="cta" to={`/${lang}/register`}>
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
          <div className="constellation">
            <div className="node">A</div>
            <div className="node">B</div>
            <div className="node">C</div>
            <div className="node">D</div>
            <svg viewBox="0 0 220 160" aria-hidden="true">
              <line x1="40" y1="40" x2="120" y2="30" />
              <line x1="120" y1="30" x2="170" y2="80" />
              <line x1="120" y1="30" x2="70" y2="120" />
              <line x1="70" y1="120" x2="170" y2="80" />
            </svg>
          </div>
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
            {clubs.length ? (
              clubs.map((club) => <span key={club.slug}>{club.name}</span>)
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
              <p>{club.summary}</p>
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

      <section className="grid" id="websites">
        <div className="section-title">
          <h3>{copy.websites_title}</h3>
          <p>{copy.websites_desc}</p>
        </div>
        <div className="cards">
          <article className="card reveal">
            <h4>{copy.websites_card1_title}</h4>
            <p>{copy.websites_card1_body}</p>
            <ul>
              <li>{copy.websites_card1_item1}</li>
              <li>{copy.websites_card1_item2}</li>
              <li>{copy.websites_card1_item3}</li>
            </ul>
          </article>
          <article className="card reveal">
            <h4>{copy.websites_card2_title}</h4>
            <p>{copy.websites_card2_body}</p>
            <ul>
              <li>{copy.websites_card2_item1}</li>
              <li>{copy.websites_card2_item2}</li>
              <li>{copy.websites_card2_item3}</li>
            </ul>
          </article>
          <article className="card reveal">
            <h4>{copy.websites_card3_title}</h4>
            <p>{copy.websites_card3_body}</p>
            <ul>
              <li>{copy.websites_card3_item1}</li>
              <li>{copy.websites_card3_item2}</li>
              <li>{copy.websites_card3_item3}</li>
            </ul>
          </article>
        </div>
        <div className="website-grid">
          {websites.map((site) => (
            <article className="data-card reveal" key={site.name}>
              <h5>{site.name}</h5>
              <p>{site.summary}</p>
              <div className="meta-row">
                <span>{site.type}</span>
                <span>{site.status}</span>
              </div>
              <a href={site.url} target="_blank" rel="noreferrer">
                {copy.website_visit}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="feature" id="blog">
        <div className="section-title">
          <h3>{copy.blog_title}</h3>
          <p>{copy.blog_desc}</p>
        </div>
        <div className="blog-grid">
          {posts.length ? (
            posts.map((post) => (
              <article className="post reveal" key={`${post.title}-${post.date}`}>
                <p className="post-date">{post.date}</p>
                <h4>{post.title}</h4>
                <p>{post.excerpt}</p>
                <div className="post-meta">
                  <span>{post.meta[0]}</span>
                  <span>{post.meta[1]}</span>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">{copy.blog_loading}</p>
          )}
        </div>
      </section>

      <section className="feature" id="moderation">
        <div className="section-title">
          <h3>{copy.moderation_title}</h3>
          <p>{copy.moderation_desc}</p>
        </div>
        {isAdmin ? (
          <div className="moderation-grid reveal">
            <div className="moderation-card">
              <p className="queue-label">{copy.moderation_pending_label}</p>
              <h4>{pendingReviews.length}</h4>
              <p>{copy.moderation_pending_desc}</p>
              <Link className="ghost" to={`/${lang}/admin`}>
                {copy.moderation_open_admin}
              </Link>
            </div>
          </div>
        ) : (
          <div className="moderation-grid reveal">
            <div className="moderation-card">
              <p className="queue-label">{copy.moderation_admin_only_title}</p>
              <h4>{copy.moderation_admin_only_title}</h4>
              <p>{copy.moderation_admin_only_desc}</p>
              <Link className="ghost" to={`/${lang}/admin`}>
                {copy.moderation_open_admin}
              </Link>
            </div>
          </div>
        )}
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

const RegisterPage = () => {
  const {
    authStatus,
    authUser,
    handleAuthClick,
    handleRegister,
    registerStatus,
    registerLoading,
    firebaseConfigured,
  } = useAppContext()
  const [registerForm, setRegisterForm] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
    location: '',
    interests: '',
    consentAge: false,
    consentPrivacy: true,
    consentPolicy: false,
  })
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (registerForm.password !== registerForm.confirmPassword) {
      return
    }
    await handleRegister({
      displayName: registerForm.displayName.trim(),
      email: registerForm.email.trim(),
      password: registerForm.password,
      location: registerForm.location.trim(),
      interests: registerForm.interests
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      consentAge: registerForm.consentAge,
      consentPrivacy: registerForm.consentPrivacy,
      consentPolicy: registerForm.consentPolicy,
    })
  }

  const passwordMismatch =
    registerForm.password.length > 0 &&
    registerForm.confirmPassword.length > 0 &&
    registerForm.password !== registerForm.confirmPassword
  const canSubmit =
    firebaseConfigured &&
    registerForm.displayName.trim().length > 0 &&
    registerForm.email.trim().length > 0 &&
    registerForm.password.length >= 8 &&
    registerForm.confirmPassword.length >= 8 &&
    registerForm.consentAge &&
    registerForm.consentPolicy &&
    !passwordMismatch &&
    !registerLoading

  return (
    <section className="feature">
      <div className="section-title">
        <h3>{copy.register_page_title}</h3>
        <p>{copy.register_page_subtitle}</p>
      </div>
      <div className="auth-panel register-panel reveal">
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
                {copy.consent_policy}
              </label>
            </div>
            <div className="register-actions register-span">
              <button className="cta" type="submit" disabled={!canSubmit}>
                {registerLoading ? copy.register_creating : copy.register_create}
              </button>
              <button
                className="ghost"
                type="button"
                onClick={handleAuthClick}
                disabled={!firebaseConfigured}
              >
                {authUser ? copy.auth_sign_out : copy.auth_sign_in_google}
              </button>
              <span className="auth-status">{authStatus}</span>
              {passwordMismatch ? (
                <span className="register-status register-status--error">
                  {copy.register_password_mismatch}
                </span>
              ) : null}
              {registerStatus ? (
                <span className="register-status">{registerStatus}</span>
              ) : null}
            </div>
          </form>
        </div>
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
            <button className="ghost" type="button">
              {copy.register_sign_in}
            </button>
          </div>
        </aside>
      </div>
    </section>
  )
}

const AdminPage = () => {
  const { pendingReviews, handleReviewModeration, isAdmin, reviews, clubNames } =
    useAppContext()
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
  const { clubs } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)

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
            <p>{club.summary}</p>
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
                  <p className="muted">{club.summary}</p>
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

  const handleSubmitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setReviewLoading(true)
    const result = await handleReviewSubmit({
      club,
      rating: reviewRating,
      text: reviewText,
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
          <p>{club.summary}</p>
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
            {!authUser ? (
              <p className="review-status review-status--error">
                {copy.review_signin_required}
              </p>
            ) : null}
            {reviewStatus ? <p className="review-status">{reviewStatus}</p> : null}
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
  const [constellations] = useState<Constellation[]>([])
  const [authStatus, setAuthStatus] = useState(copy.en.auth_status_setup)
  const [authUser, setAuthUser] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [registerStatus, setRegisterStatus] = useState('')
  const [registerLoading, setRegisterLoading] = useState(false)
  const authRef = useRef<{ auth: Auth; provider: GoogleAuthProvider } | null>(
    null
  )
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
    const auth = getAuth(app)
    const provider = new GoogleAuthProvider()
    authRef.current = { auth, provider }
    firestoreRef.current = getFirestore(app)

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(user.displayName || 'User')
        setAuthEmail(user.email || null)
        setAuthStatus(languageCopy.auth_status_pending)
      } else {
        setAuthUser(null)
        setAuthEmail(null)
        setAuthStatus(languageCopy.auth_status_pending)
      }
    })

    return () => unsubscribe()
  }, [firebaseConfigured, languageCopy.auth_status_pending, languageCopy.auth_status_config])

  useEffect(() => {
    const load = async () => {
      const [clubsData, websitesData, reviewsData, postsData] = await Promise.all(
        [
          loadJson<Club[]>('/data/clubs.json'),
          loadJson<Website[]>('/data/websites.json'),
          loadJson<Review[]>('/data/reviews.json'),
          loadJson<Post[]>('/data/posts.json'),
        ]
      )

      setClubs(clubsData ?? [])
      setWebsites(websitesData ?? [])
      setReviews(reviewsData ?? [])
      setPosts(postsData ?? [])
    }

    load()
  }, [])

  useEffect(() => {
    if (!firebaseConfigured || !firestoreRef.current) {
      return
    }
    const db = firestoreRef.current
    const approvedQuery = query(
      collection(db, 'reviews'),
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
        collection(db, 'reviews'),
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

  useRevealOnScroll([clubs, websites, reviews, posts, location.pathname])

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

  const handleRegister = async ({
    displayName,
    email,
    password,
    location,
    interests,
    consentAge,
    consentPrivacy,
    consentPolicy,
  }: {
    displayName: string
    email: string
    password: string
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

  const handleReviewSubmit = async ({
    club,
    rating,
    text,
  }: {
    club: Club
    rating: number
    text: string
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
      const authorLabel = user.displayName || user.email || 'member'
      await addDoc(collection(firestoreRef.current, 'reviews'), {
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

  const allReviews = useMemo(
    () => [...reviews, ...firestoreReviews],
    [reviews, firestoreReviews]
  )

  const handleReviewModeration = async (
    reviewId: string,
    status: 'approved' | 'rejected'
  ) => {
    if (!firestoreRef.current || !authEmail) {
      return
    }
    await updateDoc(doc(firestoreRef.current, 'reviews', reviewId), {
      status,
      reviewedAt: serverTimestamp(),
      reviewedBy: authEmail,
    })
  }

  const context: AppContext = {
    clubs,
    websites,
    posts,
    reviews: allReviews,
    constellations,
    clubNames,
    authStatus,
    authUser,
    handleAuthClick,
    handleRegister,
    registerStatus,
    registerLoading,
    handleReviewSubmit,
    handleReviewModeration,
    pendingReviews,
    isAdmin,
    firebaseConfigured,
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/en" replace />} />
      {SUPPORTED_LANGS.map((language) => (
        <Route key={language} path={`/${language}`} element={<SiteLayout context={context} />}>
          <Route index element={<HomePage />} />
          <Route path="clubs" element={<ClubsPage />} />
          <Route path="clubs/:slug" element={<ClubDetail />} />
          <Route path="cities/:citySlug" element={<CityPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
      ))}
      <Route path="*" element={<Navigate to="/en" replace />} />
    </Routes>
  )
}

export default App
