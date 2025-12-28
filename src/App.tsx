import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
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
import { type FirebaseApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
  type GoogleAuthProvider,
} from 'firebase/auth'
import {
  serverTimestamp,
  setDoc,
  doc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  onSnapshot,
  query,
  Timestamp,
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
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from 'd3-force'
import L from 'leaflet'
import { getCopy, getLangFromPath, SUPPORTED_LANGS, copy, type Lang } from './i18n/copy'
import { initFirebase, isFirebaseConfigured } from './services/firebase'
import type { AppContext } from './types/context'
import type { Club, LocalizedText, ModerationPost, Post, Review, Website } from './types/content'
import type { Event, EventCap, EventRsvp, LiveStatusKey } from './types/events'
import type { Profile, VerificationRequest } from './types/profile'
import type { Constellation, RelationshipLink } from './types/relationships'

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

const revealSafetyMedia = (event: MouseEvent<HTMLElement>) => {
  const target = event.currentTarget
  target.classList.add('user-media--reveal')
  window.setTimeout(() => target.classList.remove('user-media--reveal'), 2000)
}

const JsonLd = ({ data }: { data: Record<string, unknown> }) => (
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
)

const SITE_BASE_URL = 'https://ledbyswing.com'
const OG_IMAGE_PATH = '/assets/og-card.png'
const LOGO_PATH = '/assets/logo.png'

const upsertMetaTag = (attrs: { name?: string; property?: string; content: string }) => {
  const selector = attrs.name
    ? `meta[name="${attrs.name}"]`
    : `meta[property="${attrs.property}"]`
  const head = document.head
  let tag = head.querySelector(selector) as HTMLMetaElement | null
  if (!tag) {
    tag = document.createElement('meta')
    if (attrs.name) {
      tag.setAttribute('name', attrs.name)
    }
    if (attrs.property) {
      tag.setAttribute('property', attrs.property)
    }
    head.appendChild(tag)
  }
  tag.setAttribute('content', attrs.content)
}

const upsertLinkTag = (attrs: Record<string, string>) => {
  const selectorParts: string[] = []
  if (attrs.rel) {
    selectorParts.push(`rel="${attrs.rel}"`)
  }
  if (attrs.hreflang) {
    selectorParts.push(`hreflang="${attrs.hreflang}"`)
  }
  const selector = selectorParts.length
    ? `link[${selectorParts.join('][')}]`
    : 'link'
  const head = document.head
  let tag = head.querySelector(selector) as HTMLLinkElement | null
  if (!tag) {
    tag = document.createElement('link')
    head.appendChild(tag)
  }
  Object.entries(attrs).forEach(([key, value]) => {
    tag?.setAttribute(key, value)
  })
}
const getLocalizedText = (value: LocalizedText | string, lang: Lang) => {
  if (typeof value === 'string') {
    return value
  }
  return value[lang] ?? value.en ?? ''
}

const fillTemplate = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, value),
    template
  )

const coerceLocalizedText = (value: unknown): LocalizedText | string => {
  if (typeof value === 'string') {
    return value
  }
  if (!value || typeof value !== 'object') {
    return ''
  }
  const record = value as Record<string, unknown>
  const localized: LocalizedText = {}
  Object.entries(record).forEach(([key, entry]) => {
    if (typeof entry === 'string') {
      localized[key] = entry
    }
  })
  return localized
}

const getLocalizedList = (
  values: Array<LocalizedText | string>,
  lang: Lang
) => values.map((value) => getLocalizedText(value, lang))

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const renderMarkdown = (value: string) => {
  const lines = escapeHtml(value).split(/\r?\n/)
  const output: string[] = []
  let inList = false
  let inCode = false
  let codeLines: string[] = []

  const flushList = () => {
    if (inList) {
      output.push('</ul>')
      inList = false
    }
  }

  const flushCode = () => {
    if (inCode) {
      output.push(`<pre><code>${codeLines.join('\n')}</code></pre>`)
      codeLines = []
      inCode = false
    }
  }

  const formatInline = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')

  lines.forEach((rawLine) => {
    if (rawLine.trim().startsWith('```')) {
      if (inCode) {
        flushCode()
      } else {
        flushList()
        inCode = true
      }
      return
    }

    if (inCode) {
      codeLines.push(rawLine)
      return
    }

    const line = rawLine.trim()
    if (!line) {
      flushList()
      return
    }

    if (line.startsWith('### ')) {
      flushList()
      output.push(`<h3>${formatInline(line.slice(4))}</h3>`)
      return
    }

    if (line.startsWith('## ')) {
      flushList()
      output.push(`<h2>${formatInline(line.slice(3))}</h2>`)
      return
    }

    if (line.startsWith('# ')) {
      flushList()
      output.push(`<h1>${formatInline(line.slice(2))}</h1>`)
      return
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        output.push('<ul>')
        inList = true
      }
      output.push(`<li>${formatInline(line.slice(2))}</li>`)
      return
    }

    flushList()
    output.push(`<p>${formatInline(line)}</p>`)
  })

  flushCode()
  flushList()

  return output.join('\n')
}

const parseBlogPost = (data: Record<string, unknown>, id: string): Post => {
  const metaList = Array.isArray(data.meta) ? data.meta : []
  const meta = [
    coerceLocalizedText(metaList[0]),
    coerceLocalizedText(metaList[1]),
  ] as [LocalizedText | string, LocalizedText | string]
  const publishedAt = data.published_at as
    | { toDate?: () => Date }
    | string
    | number
    | undefined
  const publishedAtIso =
    typeof publishedAt === 'string'
      ? publishedAt
      : typeof publishedAt === 'number'
        ? new Date(publishedAt).toISOString()
        : publishedAt?.toDate?.()?.toISOString()
  return {
    id,
    slug: String(data.slug || id),
    title: coerceLocalizedText(data.title),
    date: coerceLocalizedText(data.date),
    excerpt: coerceLocalizedText(data.excerpt),
    meta,
    body: coerceLocalizedText(data.body),
    published_at: publishedAtIso,
    legacy_url: typeof data.legacy_url === 'string' ? data.legacy_url : undefined,
  }
}

const parseModerationPost = (data: Record<string, unknown>, id: string): ModerationPost => {
  const createdAt = (data.created_at || data.createdAt) as { toDate?: () => Date } | undefined
  return {
    ...parseBlogPost(data, id),
    id,
    status: typeof data.status === 'string' ? data.status : 'pending',
    author_name: typeof data.author_name === 'string' ? data.author_name : undefined,
    author_email: typeof data.author_email === 'string' ? data.author_email : undefined,
    created_at: createdAt?.toDate?.()?.toISOString(),
  }
}

const parseLegacyPost = (data: Record<string, unknown>, index: number): Post => {
  const metaList = Array.isArray(data.meta) ? data.meta : []
  const meta = [
    coerceLocalizedText(metaList[0]),
    coerceLocalizedText(metaList[1]),
  ] as [LocalizedText | string, LocalizedText | string]
  const title = coerceLocalizedText(data.title)
  const fallbackSlug = slugify(getLocalizedText(title, 'en') || `legacy-${index}`)
  const legacyUrl =
    typeof data.url === 'string'
      ? data.url
      : typeof data.legacy_url === 'string'
        ? data.legacy_url
        : undefined
  return {
    slug: typeof data.slug === 'string' ? data.slug : fallbackSlug,
    title,
    date: coerceLocalizedText(data.date),
    excerpt: coerceLocalizedText(data.excerpt),
    meta,
    body: coerceLocalizedText(data.body),
    legacy_url: legacyUrl,
  }
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

const formatCityName = (value: string) =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const getFuzzyOffset = (seed: number, minMeters = 500, maxMeters = 1000) => {
  const range = maxMeters - minMeters
  const meters = minMeters + (Math.abs(seed) % (range + 1))
  return meters / 111000
}

const hashString = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

const getRelationshipPairKey = (a: string, b: string) =>
  a < b ? `${a}_${b}` : `${b}_${a}`

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

const getStatusLabel = (status: string, translation: Record<string, string>) => {
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
  const memberKey = useMemo(
    () => (constellation.members ?? []).join('|'),
    [constellation.members]
  )
  const memberSlugs = useMemo(
    () => (constellation.members ?? []).filter(Boolean),
    [memberKey]
  )
  const memberLookup = useMemo(() => new Set(memberSlugs), [memberKey])
  const members = useMemo(
    () =>
      memberSlugs
        .map((slug) => profiles.find((profile) => profile.slug === slug))
        .filter(Boolean) as Profile[],
    [memberKey, profiles]
  )
  const linkKey = useMemo(
    () =>
      (constellation.links ?? [])
        .map((link) => `${link.user_a}|${link.user_b}|${link.link_type}|${link.status}`)
        .join('~'),
    [constellation.links]
  )
  const links = useMemo(
    () =>
      (constellation.links ?? []).filter(
        (link) => memberLookup.has(link.user_a) && memberLookup.has(link.user_b)
      ),
    [linkKey, memberKey]
  )

  const width = 260
  const height = 190
  const nodeSize = 44
  type GraphNode = Profile & { x: number; y: number }
  const [layoutNodes, setLayoutNodes] = useState<GraphNode[]>([])

  useEffect(() => {
    if (!members.length) {
      setLayoutNodes([])
      return
    }
    const nodes = members.map((profile) => ({
      ...profile,
      x: width / 2,
      y: height / 2,
    })) as GraphNode[]
    const linkData = links.map((link) => ({
      source: link.user_a,
      target: link.user_b,
    }))
    const simulation = forceSimulation<GraphNode>(nodes)
      .force('charge', forceManyBody().strength(-140))
      .force(
        'link',
        forceLink<GraphNode, { source: string; target: string }>(linkData)
          .id((node) => node.slug)
          .distance(80)
      )
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide(nodeSize / 2 + 6))
      .stop()
    simulation.tick(120)
    setLayoutNodes(nodes.map((node) => ({ ...node })))
    simulation.stop()
  }, [links, members])

  const nodeLookup = layoutNodes.reduce<Record<string, { x: number; y: number }>>(
    (acc, node) => {
      acc[node.slug] = { x: node.x, y: node.y }
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
      {layoutNodes.map((profile) => (
        <Link
          key={profile.slug}
          to={`/${lang}/profiles/${profile.slug}`}
          className="constellation-node"
          style={{
            left: `${profile.x - nodeSize / 2}px`,
            top: `${profile.y - nodeSize / 2}px`,
          }}
          aria-label={profile.display_name}
          title={profile.display_name}
        >
          {profile.photo_url ? (
            <img
              src={profile.photo_url}
              alt={profile.display_name}
              loading="lazy"
              className="user-media"
              onClick={revealSafetyMedia}
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

const SPLASH_SCREEN_ENABLED = false

const SiteLayout = ({ context }: { context: AppContext }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const lang = getLangFromPath(location.pathname)
  const [langValue, setLangValue] = useState(lang)
  const [ageConfirmed, setAgeConfirmed] = useState(!SPLASH_SCREEN_ENABLED)
  const [ageGateReady, setAgeGateReady] = useState(!SPLASH_SCREEN_ENABLED)
  const copy = getCopy(lang)
  const {
    isAdmin,
    authUser,
    handleAuthClick,
    safetyMode,
    setSafetyMode,
    clubs,
    events,
    posts,
    profiles,
  } = context
  const registerState = {
    from: `${location.pathname}${location.search}${location.hash}`,
  }

  useEffect(() => {
    setLangValue(lang)
  }, [lang])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    if (!SPLASH_SCREEN_ENABLED) {
      return
    }
    try {
      const stored = window.localStorage.getItem('lbs-age-confirmed')
      setAgeConfirmed(stored === 'true')
    } catch {
      setAgeConfirmed(false)
    } finally {
      setAgeGateReady(true)
    }
  }, [])

  useEffect(() => {
    if (!SPLASH_SCREEN_ENABLED || !ageGateReady) {
      return
    }
    document.body.style.overflow = ageConfirmed ? '' : 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [ageConfirmed, ageGateReady])

  const handleAgeConfirm = () => {
    try {
      window.localStorage.setItem('lbs-age-confirmed', 'true')
    } catch {
      // Ignore storage failures; user will see gate again.
    }
    setAgeConfirmed(true)
  }

  const handleAgeExit = () => {
    window.location.assign('https://www.google.com')
  }

  const handleLanguageChange = (value: string) => {
    const rest = location.pathname.replace(/^\/(en|pl|fr|de|it|es)/, '') || '/'
    navigate(`/${value}${rest}`)
  }

  const isActivePath = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`)

  const siteBase = SITE_BASE_URL
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'LedBySwing',
    url: siteBase,
    logo: `${siteBase}${LOGO_PATH}`,
    sameAs: ['https://twitter.com/ledbyswing'],
  }
  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'LedBySwing',
    url: siteBase,
    applicationCategory: 'SocialNetworkingApplication',
    operatingSystem: 'Web, iOS, Android',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
    },
  }

  const pageMeta = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    const page = segments[1] || ''
    const slug = segments[2] || ''
    if (!page) {
      return { title: copy.seo_default_title, description: copy.seo_default_description }
    }
    if (page === 'events') {
      if (slug === 'host') {
        return {
          title: copy.seo_events_host_title,
          description: copy.seo_default_description,
        }
      }
      if (slug) {
        const event = events.find((item) => item.slug === slug)
        const eventTitle = event?.title || copy.seo_event_fallback
        return {
          title: fillTemplate(copy.seo_event_detail_title, { event: eventTitle }),
          description: copy.seo_default_description,
        }
      }
      return {
        title: copy.seo_events_title,
        description: copy.seo_default_description,
      }
    }
    if (page === 'cities' && slug) {
      const cityName = formatCityName(slug)
      return {
        title: fillTemplate(copy.seo_city_events_title, { city: cityName }),
        description: copy.seo_default_description,
      }
    }
    if (page === 'clubs') {
      if (slug) {
        const club = clubs.find((item) => item.slug === slug)
        const clubTitle = club?.name || copy.seo_club_fallback
        return {
          title: fillTemplate(copy.seo_club_detail_title, { club: clubTitle }),
          description: copy.seo_default_description,
        }
      }
      return {
        title: copy.seo_clubs_title,
        description: copy.seo_default_description,
      }
    }
    if (page === 'blog') {
      if (slug) {
        const post = posts.find((item) => item.slug === slug)
        const postTitle = post
          ? getLocalizedText(post.title, lang)
          : copy.seo_blog_fallback
        return {
          title: fillTemplate(copy.seo_blog_post_title, { post: postTitle }),
          description: copy.seo_default_description,
        }
      }
      return {
        title: copy.seo_blog_title,
        description: copy.seo_default_description,
      }
    }
    if (page === 'profiles' && slug) {
      const profile = profiles.find((item) => item.slug === slug)
      const profileTitle = profile?.display_name || copy.seo_profile_fallback
      return {
        title: fillTemplate(copy.seo_profile_title, { profile: profileTitle }),
        description: copy.seo_default_description,
      }
    }
    if (page === 'map') {
      return {
        title: copy.seo_map_title,
        description: copy.seo_default_description,
      }
    }
    if (page === 'register') {
      return {
        title: copy.seo_register_title,
        description: copy.seo_default_description,
      }
    }
    if (page === 'profile') {
      return {
        title: copy.seo_profile_settings_title,
        description: copy.seo_default_description,
      }
    }
    if (page === 'messages') {
      return {
        title: copy.seo_messages_title,
        description: copy.seo_default_description,
      }
    }
    if (page === 'guidelines') {
      return {
        title: copy.seo_guidelines_title,
        description: copy.seo_default_description,
      }
    }
    if (page === 'admin') {
      return {
        title: copy.seo_admin_title,
        description: copy.seo_default_description,
      }
    }
    return { title: copy.seo_default_title, description: copy.seo_default_description }
  }, [location.pathname, clubs, copy, events, lang, posts, profiles])

  useEffect(() => {
    const canonicalUrl = `${siteBase}${location.pathname}`
    document.title = pageMeta.title
    document.documentElement.lang = lang
    upsertMetaTag({ name: 'description', content: pageMeta.description })
    upsertMetaTag({ property: 'og:title', content: pageMeta.title })
    upsertMetaTag({ property: 'og:description', content: pageMeta.description })
    upsertMetaTag({ property: 'og:type', content: 'website' })
    upsertMetaTag({ property: 'og:url', content: canonicalUrl })
    upsertMetaTag({ property: 'og:image', content: `${siteBase}${OG_IMAGE_PATH}` })
    upsertMetaTag({ property: 'og:image:alt', content: copy.seo_og_alt })
    upsertMetaTag({ name: 'twitter:card', content: 'summary_large_image' })
    upsertMetaTag({ name: 'twitter:title', content: pageMeta.title })
    upsertMetaTag({ name: 'twitter:description', content: pageMeta.description })
    upsertMetaTag({ name: 'twitter:image', content: `${siteBase}${OG_IMAGE_PATH}` })
    upsertLinkTag({ rel: 'canonical', href: canonicalUrl })
    upsertLinkTag({ rel: 'alternate', hreflang: 'en', href: `${siteBase}/en` })
    upsertLinkTag({ rel: 'alternate', hreflang: 'x-default', href: `${siteBase}/en` })
  }, [copy.seo_og_alt, lang, location.pathname, pageMeta.description, pageMeta.title, siteBase])

  return (
    <div>
      <JsonLd data={organizationSchema} />
      <JsonLd data={softwareSchema} />
      {SPLASH_SCREEN_ENABLED && !ageConfirmed && ageGateReady ? (
        <div className="age-gate" role="dialog" aria-modal="true">
          <div className="age-gate-card">
            <p className="eyebrow">{copy.age_gate_kicker}</p>
            <h2>{copy.age_gate_title}</h2>
            <p className="muted">{copy.age_gate_body}</p>
            <div className="age-gate-actions">
              <button className="cta" type="button" onClick={handleAgeConfirm}>
                {copy.age_gate_confirm}
              </button>
              <button className="ghost" type="button" onClick={handleAgeExit}>
                {copy.age_gate_exit}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
            <p className="site-tagline">{copy.site_tagline}</p>
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
          <button
            className="ghost"
            type="button"
            onClick={() => setSafetyMode(!safetyMode)}
          >
            {safetyMode ? copy.safety_mode_disable : copy.safety_mode_enable}
          </button>
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
        <div className="footer-links">
          <h4>{copy.footer_popular_title}</h4>
          <div className="footer-link-list">
            <Link to={`/${lang}`}>{copy.footer_popular_link1}</Link>
            <Link to={`/${lang}#constellations`}>{copy.footer_popular_link2}</Link>
            <Link to={`/${lang}`}>{copy.footer_popular_link3}</Link>
            <Link to={`/${lang}/events`}>{copy.footer_popular_link4}</Link>
          </div>
        </div>
        <div className="footer-actions">
          <Link className="ghost" to={`/${lang}/guidelines`}>
            {copy.footer_guidelines}
          </Link>
        </div>
      </footer>
      <nav className="mobile-nav" aria-label={copy.mobile_nav_label}>
        <Link
          className={isActivePath(`/${lang}`) ? 'active' : ''}
          to={`/${lang}`}
        >
          {copy.mobile_nav_feed}
        </Link>
        <Link
          className={isActivePath(`/${lang}/events`) ? 'active' : ''}
          to={`/${lang}/events`}
        >
          {copy.mobile_nav_search}
        </Link>
        <Link className="mobile-nav-create" to={`/${lang}/events/host`}>
          {copy.mobile_nav_create}
        </Link>
        <Link
          className={isActivePath(`/${lang}/messages`) ? 'active' : ''}
          to={`/${lang}/messages`}
        >
          {copy.mobile_nav_messages}
        </Link>
        <Link
          className={isActivePath(`/${lang}/profile`) ? 'active' : ''}
          to={`/${lang}/profile`}
        >
          {copy.mobile_nav_profile}
        </Link>
      </nav>
    </div>
  )
}

const HomePage = () => {
  const { authUser, clubs, constellations, profiles, posts } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const createConstellationPath = `/${lang}/profile#constellation-links`
  const registerState = {
    from: createConstellationPath,
  }
  const highlightClubs = useMemo(() => {
    if (!clubs.length) {
      return []
    }
    const sorted = [...clubs].sort(
      (a, b) => hashString(a.slug) - hashString(b.slug)
    )
    return sorted.slice(0, 10)
  }, [clubs])
  const previewClubs = useMemo(() => clubs.slice(0, 6), [clubs])
  const faqItems = [
    {
      question: copy.faq_q1,
      answer: copy.faq_a1,
    },
    {
      question: copy.faq_q2,
      answer: copy.faq_a2,
    },
    {
      question: copy.faq_q3,
      answer: copy.faq_a3,
    },
  ]
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return (
    <>
      <JsonLd data={faqSchema} />
      <section className="hero">
        <div className="hero-copy">
          <p className="pill">{copy.hero_pill}</p>
          <h1>{copy.home_h1}</h1>
          <h2>{copy.hero_title}</h2>
          <p className="lead">
            {copy.hero_lead}
          </p>
          <p className="lead">{copy.hero_paragraph}</p>
          <div className="hero-actions">
            <Link
              className="cta"
              to={authUser ? createConstellationPath : `/${lang}/register`}
              state={authUser ? undefined : registerState}
            >
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
          {previewClubs.map((club) => (
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
              const postKey = `${getLocalizedText(post.title, 'en')}-${getLocalizedText(
                post.date,
                'en'
              )}`
              return (
                <Link
                  className="post reveal"
                  to={`/${lang}/blog/${post.slug}`}
                  key={postKey}
                >
                  <p className="post-date">{postDate}</p>
                  <h4>{postTitle}</h4>
                  <p>{getLocalizedText(post.excerpt, lang)}</p>
                  <div className="post-meta">
                    <span>{meta[0]}</span>
                    <span>{meta[1]}</span>
                  </div>
                </Link>
              )
            })
          ) : (
            <p className="muted">{copy.blog_loading}</p>
          )}
        </div>
      </section>

      <section className="faq">
        <div className="section-title">
          <h3>{copy.faq_title}</h3>
          <p>{copy.faq_desc}</p>
        </div>
        <div className="faq-grid">
          {faqItems.map((item) => (
            <article key={item.question} className="faq-card reveal">
              <h4>{item.question}</h4>
              <p>{item.answer}</p>
            </article>
          ))}
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
  const mapInstanceRef = useRef<ReturnType<typeof L.map> | null>(null)
  const markersRef = useRef<ReturnType<typeof L.layerGroup> | null>(null)

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
            const postKey = `${getLocalizedText(post.title, 'en')}-${getLocalizedText(
              post.date,
              'en'
            )}`
            return (
              <Link
                className="post reveal"
                to={`/${lang}/blog/${post.slug}`}
                key={postKey}
              >
                <p className="post-date">{postDate}</p>
                <h4>{postTitle}</h4>
                <p>{getLocalizedText(post.excerpt, lang)}</p>
                <div className="post-meta">
                  <span>{meta[0]}</span>
                  <span>{meta[1]}</span>
                </div>
              </Link>
            )
          })
        ) : (
          <p className="muted">{copy.blog_loading}</p>
        )}
      </div>
    </section>
  )
}

const BlogPostPage = () => {
  const { posts } = useAppContext()
  const location = useLocation()
  const { slug } = useParams()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const post = posts.find((entry) => entry.slug === slug)

  if (!post) {
    return (
      <section className="feature">
        <div className="section-title">
          <h3>{copy.blog_title}</h3>
          <p>{copy.blog_desc}</p>
        </div>
        <p className="muted">Article not found.</p>
        <Link className="text-link" to={`/${lang}/blog`}>
          {copy.nav_blog}
        </Link>
      </section>
    )
  }

  const postDate = getLocalizedText(post.date, lang)
  const postTitle = getLocalizedText(post.title, lang)
  const postBody = getLocalizedText(post.body, lang)
  const postMeta = getLocalizedList(post.meta, lang)
  const isHtmlBody = /<\/(p|div|figure|h[1-6]|img|video|ul|ol|blockquote)>/i.test(
    postBody
  )
  const bodyHtml = useMemo(
    () => (isHtmlBody ? postBody : renderMarkdown(postBody)),
    [isHtmlBody, postBody]
  )

  return (
    <section className="feature">
      <div className="section-title post-detail">
        <p className="post-date">{postDate}</p>
        <h3>{postTitle}</h3>
        <div className="post-meta">
          <span>{postMeta[0]}</span>
          <span>{postMeta[1]}</span>
        </div>
      </div>
      <div
        className="post-body"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
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
    handleAccountDelete,
    safetyMode,
    setSafetyMode,
    userHasRsvp,
    relationshipLinks,
    pendingLinkRequests,
    handleLinkRequest,
    handleLinkResponse,
    handleLinkVisibility,
  } = useAppContext()
  const location = useLocation()
  const navigate = useNavigate()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const registerState = {
    from: `${location.pathname}${location.search}${location.hash}`,
  }
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof Notification === 'undefined') {
      return false
    }
    return Notification.permission === 'granted'
  })
  const [notificationsStatus, setNotificationsStatus] = useState('')
  const [verificationFile, setVerificationFile] = useState<File | null>(null)
  const [verificationStatus, setVerificationStatus] = useState('')
  const [verificationLoading, setVerificationLoading] = useState(false)
  const [profileStatus, setProfileStatus] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [deleteStatus, setDeleteStatus] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
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

  const underage =
    profileForm.birthDate.length > 0 && !isAdult(profileForm.birthDate)

  const outgoingRequests = relationshipLinks.filter(
    (link) => link.status === 'Pending' && link.user_a === authUid
  )
  const confirmedLinks = relationshipLinks.filter(
    (link) => link.status === 'Confirmed'
  )

  const onboardingSteps = [
    {
      id: 'photo',
      label: copy.onboarding_step_photo,
      done: Boolean(profilePhotoUrl),
    },
    {
      id: 'desires',
      label: copy.onboarding_step_desires,
      done: profileForm.interests.trim().length > 0,
    },
    {
      id: 'event',
      label: copy.onboarding_step_event,
      done: userHasRsvp,
    },
  ]
  const onboardingDoneCount = onboardingSteps.filter((step) => step.done).length
  const showOnboarding = onboardingDoneCount < onboardingSteps.length
  const onboardingProgress = Math.round(
    (onboardingDoneCount / onboardingSteps.length) * 100
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

  const handleDeleteClick = async () => {
    const confirmation = window.prompt(copy.delete_account_confirm_prompt)
    if (confirmation !== copy.delete_account_confirm_value) {
      setDeleteStatus(copy.delete_account_status_cancelled)
      return
    }
    setDeleteLoading(true)
    const result = await handleAccountDelete()
    setDeleteStatus(result.message)
    setDeleteLoading(false)
    if (result.ok) {
      navigate(`/${lang}`)
    }
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
      {showOnboarding ? (
        <div className="data-card detail-card onboarding-card">
          <h5>{copy.onboarding_title}</h5>
          <p className="muted">{copy.onboarding_desc}</p>
          <div className="onboarding-progress" role="progressbar" aria-valuenow={onboardingProgress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${onboardingProgress}%` }} />
          </div>
          <div className="onboarding-steps">
            {onboardingSteps.map((step) => (
              <span
                key={step.id}
                className={step.done ? 'onboarding-step onboarding-step--done' : 'onboarding-step'}
              >
                {step.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
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
                className="user-media"
                loading="lazy"
                onClick={revealSafetyMedia}
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
                    } catch {
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
          <h5>{copy.safety_mode_title}</h5>
          <p className="muted">{copy.safety_mode_desc}</p>
          <div className="link-form">
            <button
              className="cta"
              type="button"
              onClick={() => setSafetyMode(!safetyMode)}
            >
              {safetyMode ? copy.safety_mode_disable : copy.safety_mode_enable}
            </button>
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
      <div className="detail-grid link-grid" id="constellation-links">
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
        <div className="data-card detail-card">
          <h5>{copy.delete_account_title}</h5>
          <p className="muted">{copy.delete_account_desc}</p>
          <div className="link-form">
            <button
              className="ghost"
              type="button"
              onClick={handleDeleteClick}
              disabled={deleteLoading}
            >
              {deleteLoading ? copy.delete_account_deleting : copy.delete_account_button}
            </button>
            {deleteStatus ? <p className="register-status">{deleteStatus}</p> : null}
          </div>
        </div>
      </div>
    </section>
  )
}

const MessagesPage = () => {
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)

  return (
    <section className="feature">
      <div className="section-title">
        <h3>{copy.messages_page_title}</h3>
        <p>{copy.messages_page_desc}</p>
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
              <img
                src={profile.photo_url}
                alt={profile.display_name}
                className="user-media"
                loading="lazy"
                onClick={revealSafetyMedia}
              />
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

const AdminLayout = () => {
  const context = useOutletContext<AppContext>()
  const { isAdmin } = context
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const basePath = `/${lang}/admin`
  const navItems = [
    { path: basePath, label: copy.admin_nav_overview },
    { path: `${basePath}/reviews`, label: copy.admin_nav_reviews },
    { path: `${basePath}/blog`, label: copy.admin_nav_blog },
    { path: `${basePath}/verification`, label: copy.admin_nav_verification },
    { path: `${basePath}/events`, label: copy.admin_nav_events },
  ]

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
      <div className="admin-nav">
        {navItems.map((item) => (
          <Link
            key={item.path}
            className={location.pathname === item.path ? 'active' : ''}
            to={item.path}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <Outlet context={context} />
    </section>
  )
}

const AdminOverview = () => {
  const { pendingReviews, pendingBlogPosts, reviews } = useAppContext()
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

  return (
    <>
      <div className="admin-grid">
        <div className="admin-card">
          <p className="queue-label">{copy.admin_pending_title}</p>
          <h4>{pendingReviews.length}</h4>
          <p>{copy.admin_pending_desc}</p>
        </div>
        <div className="admin-card">
          <p className="queue-label">{copy.admin_blog_pending_title}</p>
          <h4>{pendingBlogPosts.length}</h4>
          <p>{copy.admin_blog_pending_desc}</p>
        </div>
        <div className="admin-card">
          <p className="queue-label">{copy.admin_approved_title}</p>
          <h4>{approvedReviews.length}</h4>
          <p>{copy.admin_approved_desc}</p>
        </div>
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
    </>
  )
}

const AdminReviewsPage = () => {
  const { pendingReviews, handleReviewModeration, clubNames } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)

  return (
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
  )
}

const AdminBlogPage = () => {
  const {
    pendingBlogPosts,
    handleBlogModeration,
    handleBlogSave,
    posts,
  } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const [blogForm, setBlogForm] = useState({
    title: '',
    slug: '',
    date: '',
    excerpt: '',
    meta1: '',
    meta2: '',
    body: '',
    legacyUrl: '',
    status: 'published' as 'published' | 'pending',
  })
  const [blogStatus, setBlogStatus] = useState('')
  const [blogLoading, setBlogLoading] = useState(false)
  const [blogEditingId, setBlogEditingId] = useState<string | null>(null)
  const [blogBase, setBlogBase] = useState<Post | ModerationPost | null>(null)

  const updateLocalized = (
    current: LocalizedText | string | undefined,
    value: string
  ) => {
    if (typeof current === 'object' && current) {
      return { ...current, [lang]: value }
    }
    return { [lang]: value }
  }

  const resetBlogForm = () => {
    setBlogForm({
      title: '',
      slug: '',
      date: '',
      excerpt: '',
      meta1: '',
      meta2: '',
      body: '',
      legacyUrl: '',
      status: 'published',
    })
    setBlogEditingId(null)
    setBlogBase(null)
    setBlogStatus('')
  }

  const loadBlogForm = (post: Post | ModerationPost) => {
    const metaList = Array.isArray(post.meta) ? post.meta : []
    setBlogForm({
      title: getLocalizedText(post.title, lang),
      slug: post.slug,
      date: getLocalizedText(post.date, lang),
      excerpt: getLocalizedText(post.excerpt, lang),
      meta1: getLocalizedText(metaList[0], lang),
      meta2: getLocalizedText(metaList[1], lang),
      body: getLocalizedText(post.body, lang),
      legacyUrl: post.legacy_url || '',
      status: 'status' in post && post.status === 'pending' ? 'pending' : 'published',
    })
    setBlogEditingId(post.id || post.slug)
    setBlogBase(post)
    setBlogStatus('')
  }

  const handleBlogSaveSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!blogForm.title.trim()) {
      setBlogStatus(copy.admin_blog_missing_title)
      return
    }
    if (!blogForm.body.trim()) {
      setBlogStatus(copy.admin_blog_missing_body)
      return
    }
    setBlogLoading(true)
    const slug = blogEditingId
      ? blogForm.slug
      : blogForm.slug.trim() || slugify(blogForm.title)
    const baseMeta = Array.isArray(blogBase?.meta) ? blogBase?.meta : []
    const payload = {
      id: blogEditingId || undefined,
      slug,
      title: updateLocalized(blogBase?.title, blogForm.title),
      date: updateLocalized(blogBase?.date, blogForm.date),
      excerpt: updateLocalized(blogBase?.excerpt, blogForm.excerpt),
      meta: [
        updateLocalized(baseMeta?.[0], blogForm.meta1),
        updateLocalized(baseMeta?.[1], blogForm.meta2),
      ] as [LocalizedText | string, LocalizedText | string],
      body: updateLocalized(blogBase?.body, blogForm.body),
      legacy_url: blogForm.legacyUrl.trim(),
      status: blogForm.status,
    }
    const result = await handleBlogSave(payload)
    setBlogStatus(result.message)
    if (result.ok && !blogEditingId) {
      resetBlogForm()
    }
    setBlogLoading(false)
  }

  return (
    <>
      <div className="admin-panel">
        <div className="admin-panel-header">
          <h4>{copy.admin_blog_editor_title}</h4>
          <p className="muted">{copy.admin_blog_editor_desc}</p>
        </div>
        <form className="review-form" onSubmit={handleBlogSaveSubmit}>
          <div className="review-form-header">
            <p className="review-status">{blogStatus || copy.admin_blog_editor_hint}</p>
          </div>
          <label>
            {copy.admin_blog_field_title}
            <input
              className="register-input"
              value={blogForm.title}
              onChange={(eventInput) =>
                setBlogForm((prev) => ({ ...prev, title: eventInput.target.value }))
              }
            />
          </label>
          <label>
            {copy.admin_blog_field_slug}
            <input
              className="register-input"
              value={blogForm.slug}
              onChange={(eventInput) =>
                setBlogForm((prev) => ({ ...prev, slug: eventInput.target.value }))
              }
              disabled={Boolean(blogEditingId)}
            />
          </label>
          <label>
            {copy.admin_blog_field_date}
            <input
              className="register-input"
              value={blogForm.date}
              onChange={(eventInput) =>
                setBlogForm((prev) => ({ ...prev, date: eventInput.target.value }))
              }
            />
          </label>
          <label>
            {copy.admin_blog_field_excerpt}
            <textarea
              placeholder={copy.admin_blog_field_excerpt}
              value={blogForm.excerpt}
              onChange={(eventInput) =>
                setBlogForm((prev) => ({ ...prev, excerpt: eventInput.target.value }))
              }
            ></textarea>
          </label>
          <label>
            {copy.admin_blog_field_meta_1}
            <input
              className="register-input"
              value={blogForm.meta1}
              onChange={(eventInput) =>
                setBlogForm((prev) => ({ ...prev, meta1: eventInput.target.value }))
              }
            />
          </label>
          <label>
            {copy.admin_blog_field_meta_2}
            <input
              className="register-input"
              value={blogForm.meta2}
              onChange={(eventInput) =>
                setBlogForm((prev) => ({ ...prev, meta2: eventInput.target.value }))
              }
            />
          </label>
          <label>
            {copy.admin_blog_field_body}
            <textarea
              placeholder={copy.admin_blog_field_body}
              value={blogForm.body}
              onChange={(eventInput) =>
                setBlogForm((prev) => ({ ...prev, body: eventInput.target.value }))
              }
            ></textarea>
          </label>
          <label>
            {copy.admin_blog_field_legacy}
            <input
              className="register-input"
              value={blogForm.legacyUrl}
              onChange={(eventInput) =>
                setBlogForm((prev) => ({ ...prev, legacyUrl: eventInput.target.value }))
              }
            />
          </label>
          <label>
            {copy.admin_blog_field_status}
            <select
              value={blogForm.status}
              onChange={(eventInput) =>
                setBlogForm((prev) => ({
                  ...prev,
                  status: eventInput.target.value as 'published' | 'pending',
                }))
              }
            >
              <option value="published">{copy.admin_blog_status_published}</option>
              <option value="pending">{copy.admin_blog_status_pending}</option>
            </select>
          </label>
          <div className="admin-actions">
            <button className="ghost" type="button" onClick={resetBlogForm}>
              {copy.admin_blog_new}
            </button>
            <button className="cta" type="submit" disabled={blogLoading}>
              {blogLoading ? copy.admin_blog_saving : copy.admin_blog_save}
            </button>
          </div>
        </form>
      </div>
      <div className="admin-panel">
        <div className="admin-panel-header">
          <h4>{copy.admin_blog_queue_title}</h4>
          <p className="muted">{copy.admin_blog_queue_desc}</p>
        </div>
        {pendingBlogPosts.length ? (
          <div className="admin-list">
            {pendingBlogPosts.map((post) => {
              const postTitle = getLocalizedText(post.title, lang)
              const postExcerpt = getLocalizedText(post.excerpt, lang)
              return (
                <div className="admin-item" key={post.id}>
                  <div className="admin-item-main">
                    <p className="review-name">{postTitle || post.slug}</p>
                    <p className="muted">
                      {post.author_name || copy.admin_blog_author_unknown}
                      {post.author_email ? ` · ${post.author_email}` : ''}
                    </p>
                    {postExcerpt ? <p className="admin-text">{postExcerpt}</p> : null}
                  </div>
                  <div className="admin-actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => loadBlogForm(post)}
                    >
                      {copy.admin_blog_edit}
                    </button>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => handleBlogModeration(post.id, 'rejected')}
                    >
                      {copy.admin_blog_action_reject}
                    </button>
                    <button
                      className="cta"
                      type="button"
                      onClick={() => handleBlogModeration(post.id, 'published')}
                    >
                      {copy.admin_blog_action_publish}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="muted">{copy.admin_blog_empty}</p>
        )}
      </div>
      <div className="admin-panel">
        <div className="admin-panel-header">
          <h4>{copy.admin_blog_published_title}</h4>
          <p className="muted">{copy.admin_blog_published_desc}</p>
        </div>
        {posts.length ? (
          <div className="admin-list">
            {posts.slice(0, 8).map((post) => {
              const postTitle = getLocalizedText(post.title, lang)
              const postExcerpt = getLocalizedText(post.excerpt, lang)
              const postId = post.id || post.slug
              return (
                <div className="admin-item" key={postId}>
                  <div className="admin-item-main">
                    <p className="review-name">{postTitle || post.slug}</p>
                    {postExcerpt ? <p className="admin-text">{postExcerpt}</p> : null}
                  </div>
                  <div className="admin-actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => loadBlogForm(post)}
                    >
                      {copy.admin_blog_edit}
                    </button>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => handleBlogModeration(postId, 'pending')}
                    >
                      {copy.admin_blog_action_depublish}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="muted">{copy.admin_blog_published_empty}</p>
        )}
      </div>
    </>
  )
}

const AdminVerificationPage = () => {
  const { verificationRequests, handleVerificationModeration } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)

  return (
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
                    className="admin-photo user-media"
                    src={request.photo_url}
                    alt={request.user_name}
                    loading="lazy"
                    onClick={revealSafetyMedia}
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
  )
}

const AdminEventsPage = () => {
  const { pendingEventRsvps, events, handleEventRsvpUpdate } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const eventLookup = useMemo(
    () =>
      events.reduce<Record<string, Event>>((acc, event) => {
        acc[event.slug] = event
        return acc
      }, {}),
    [events]
  )

  return (
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
  )
}

const ClubsPage = () => {
  const { clubs, handleClubSubmit, authUser, firebaseConfigured } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const registerState = {
    from: `${location.pathname}${location.search}${location.hash}`,
  }
  const [clubName, setClubName] = useState('')
  const [clubCity, setClubCity] = useState('')
  const [clubCountry, setClubCountry] = useState('')
  const [clubWebsite, setClubWebsite] = useState('')
  const [clubSummary, setClubSummary] = useState('')
  const [clubStatus, setClubStatus] = useState('')
  const [clubLoading, setClubLoading] = useState(false)
  const comingSoonClubs = [
    copy.clubs_coming_soon_item1,
    copy.clubs_coming_soon_item2,
    copy.clubs_coming_soon_item3,
    copy.clubs_coming_soon_item4,
    copy.clubs_coming_soon_item5,
  ]

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
      <div className="coming-soon">
        <h4>{copy.clubs_coming_soon_title}</h4>
        <ul>
          {comingSoonClubs.map((club) => (
            <li key={club}>{club}</li>
          ))}
        </ul>
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
      {authUser ? (
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
      ) : (
        <div className="review-panel">
          <div className="section-title">
            <h3>{copy.club_submit_title}</h3>
            <p>{copy.club_submit_desc}</p>
          </div>
          <p className="muted">{copy.club_submit_signin_required}</p>
          <Link className="cta" to={`/${lang}/register`} state={registerState}>
            {copy.request_access}
          </Link>
        </div>
      )}
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

const CityEventsPage = ({ citySlug }: { citySlug?: string }) => {
  const { events } = useAppContext()
  const params = useParams()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const slug = citySlug || params.citySlug || params.slug || ''
  const cityName = formatCityName(slug)
  const cityEvents = useMemo(
    () =>
      events.filter(
        (event) => slugify(event.city || '') === slug.toLowerCase()
      ),
    [events, slug]
  )

  return (
    <section className="feature">
      <div className="section-title">
        <h3>{copy.city_events_title.replace('{city}', cityName)}</h3>
        <p>
          {cityEvents.length
            ? copy.city_events_desc.replace('{city}', cityName)
            : copy.city_events_empty.replace('{city}', cityName)}
        </p>
      </div>
      {cityEvents.length ? (
        <div className="club-grid">
          {cityEvents.map((event) => (
            <article className="data-card reveal" key={event.slug}>
              <h5>
                <Link to={`/${lang}/events/${event.slug}`}>{event.title}</Link>
              </h5>
              <p>{event.summary}</p>
              <div className="meta-row">
                <span>{event.date}</span>
                <span>{event.city}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
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
  const siteBase = SITE_BASE_URL
  const eventSchema = useMemo(() => {
    if (!event) {
      return null
    }
    const locationData =
      event.privacy_tier === 'Private'
        ? undefined
        : {
            '@type': 'Place',
            name: event.address || event.city,
            address: {
              '@type': 'PostalAddress',
              streetAddress: event.address,
              addressLocality: event.city,
            },
          }
    return {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: event.title,
      startDate: event.date,
      description: event.summary,
      url: `${siteBase}/${lang}/events/${event.slug}`,
      location: locationData,
      organizer: {
        '@type': 'Person',
        name: event.host_name,
      },
    }
  }, [event, lang, siteBase])

  useEffect(() => {
    if (!event || !firebaseConfigured) {
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
    return <CityEventsPage citySlug={slug} />
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
  const hasCoords =
    typeof event.lat === 'number' && Number.isFinite(event.lat) &&
    typeof event.lng === 'number' && Number.isFinite(event.lng)
  const shouldFuzzCoords = hasCoords && !addressVisible
  const baseLat = hasCoords ? event.lat : undefined
  const baseLng = hasCoords ? event.lng : undefined
  const lngScale = hasCoords
    ? 1 / Math.max(0.25, Math.cos(((event.lat as number) * Math.PI) / 180))
    : 1
  const fuzzyLat = shouldFuzzCoords && baseLat !== undefined
    ? baseLat +
      (hashString(`${event.slug}-lat`) % 2 === 0 ? 1 : -1) *
        getFuzzyOffset(hashString(`${event.slug}-lat`))
    : baseLat
  const fuzzyLng = shouldFuzzCoords && baseLng !== undefined
    ? baseLng +
      (hashString(`${event.slug}-lng`) % 2 === 0 ? 1 : -1) *
        getFuzzyOffset(hashString(`${event.slug}-lng`)) *
        lngScale
    : baseLng

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
      {eventSchema ? <JsonLd data={eventSchema} /> : null}
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
          {hasCoords ? (
            <p className="muted">
              {shouldFuzzCoords
                ? copy.event_location_approx
                : copy.event_location_exact}{' '}
              {fuzzCoordinate(fuzzyLat ?? 0, 3)}, {fuzzCoordinate(fuzzyLng ?? 0, 3)}
            </p>
          ) : null}
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
  const {
    events,
    authEmail,
    firebaseConfigured,
    subscribeEventRsvps,
    handleEventCheckin,
  } = useAppContext()
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)
  const registerState = {
    from: `${location.pathname}${location.search}${location.hash}`,
  }
  const hostEmail = authEmail?.toLowerCase()
  const [rsvpMap, setRsvpMap] = useState<Record<string, EventRsvp[]>>({})
  const [checkinTokens, setCheckinTokens] = useState<Record<string, string>>({})
  const [checkinStatus, setCheckinStatus] = useState<Record<string, string>>({})
  const [checkinLoading, setCheckinLoading] = useState<Record<string, boolean>>(
    {}
  )

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

  const visibleRsvpMap = useMemo(() => {
    if (!firebaseConfigured || !hostEvents.length) {
      return {}
    }
    return hostEvents.reduce<Record<string, EventRsvp[]>>((acc, event) => {
      const rsvps = rsvpMap[event.slug]
      if (rsvps) {
        acc[event.slug] = rsvps
      }
      return acc
    }, {})
  }, [firebaseConfigured, hostEvents, rsvpMap])

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
          const rsvps = visibleRsvpMap[event.slug] ?? []
          const pending = rsvps.filter((item) => item.status === 'Pending')
          const approved = rsvps.filter((item) => item.status === 'Approved')
          const tokenValue = checkinTokens[event.slug] || ''
          const statusMessage = checkinStatus[event.slug] || ''
          const isLoading = checkinLoading[event.slug] || false
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
              <form
                className="link-form"
                onSubmit={async (eventInput) => {
                  eventInput.preventDefault()
                  if (!tokenValue.trim()) {
                    setCheckinStatus((prev) => ({
                      ...prev,
                      [event.slug]: copy.event_checkin_missing,
                    }))
                    return
                  }
                  setCheckinLoading((prev) => ({ ...prev, [event.slug]: true }))
                  const result = await handleEventCheckin({
                    token: tokenValue.trim(),
                    eventSlug: event.slug,
                  })
                  setCheckinStatus((prev) => ({
                    ...prev,
                    [event.slug]: result.message,
                  }))
                  if (result.ok) {
                    setCheckinTokens((prev) => ({ ...prev, [event.slug]: '' }))
                  }
                  setCheckinLoading((prev) => ({ ...prev, [event.slug]: false }))
                }}
              >
                <label>
                  {copy.event_checkin_label}
                  <input
                    className="register-input"
                    value={tokenValue}
                    placeholder={copy.event_checkin_placeholder}
                    onChange={(eventInput) =>
                      setCheckinTokens((prev) => ({
                        ...prev,
                        [event.slug]: eventInput.target.value,
                      }))
                    }
                  />
                </label>
                <button className="cta" type="submit" disabled={isLoading}>
                  {isLoading ? copy.event_checkin_loading : copy.event_checkin_button}
                </button>
                {statusMessage ? (
                  <p className="register-status">{statusMessage}</p>
                ) : null}
              </form>
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

const NotFoundPage = () => {
  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const copy = getCopy(lang)

  return (
    <section className="feature">
      <div className="section-title">
        <h3>{copy.not_found_title}</h3>
        <p>
          {copy.not_found_body}{' '}
          <Link to={`/${lang}`}>{copy.not_found_home}</Link>{' '}
          {copy.not_found_body_connector}{' '}
          <Link to={`/${lang}/events`}>{copy.not_found_events}</Link>.
        </p>
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
  const clubReviews = useMemo(
    () => reviews.filter((review) => review.club_slug === slug),
    [reviews, slug]
  )
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
  const [pendingBlogPosts, setPendingBlogPosts] = useState<ModerationPost[]>([])
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
  const [firestoreReady, setFirestoreReady] = useState(false)
  const [registerStatus, setRegisterStatus] = useState('')
  const [registerLoading, setRegisterLoading] = useState(false)
  const [signInLoading, setSignInLoading] = useState(false)
  const [signInStatus, setSignInStatus] = useState('')
  const [safetyMode, setSafetyMode] = useState(false)
  const [userHasRsvp, setUserHasRsvp] = useState(false)
  const authRef = useRef<{ auth: Auth; provider: GoogleAuthProvider } | null>(
    null
  )
  const appRef = useRef<FirebaseApp | null>(null)
  const firestoreRef = useRef<ReturnType<typeof initFirebase>['firestore'] | null>(
    null
  )

  const location = useLocation()
  const lang = getLangFromPath(location.pathname)
  const languageCopy = getCopy(lang)
  const isAdmin = authEmail?.toLowerCase() === 'b@bernhard-huber.eu'

  const firebaseConfigured = useMemo(() => isFirebaseConfigured(), [])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('lbs-safety-mode')
      setSafetyMode(stored === 'true')
    } catch {
      setSafetyMode(false)
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('safety-mode', safetyMode)
    try {
      window.localStorage.setItem('lbs-safety-mode', safetyMode ? 'true' : 'false')
    } catch {
      // Ignore storage failures.
    }
  }, [safetyMode])

  useEffect(() => {
    if (!firebaseConfigured) {
      setAuthStatus(languageCopy.auth_status_config)
      return
    }

    const { app, auth, provider, firestore } = initFirebase()
    appRef.current = app
    authRef.current = { auth, provider }
    firestoreRef.current = firestore
    setFirestoreReady(true)

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
    if (!firestoreRef.current || !authUid) {
      setUserHasRsvp(false)
      return
    }
    const rsvpQuery = query(
      collection(firestoreRef.current, 'event_rsvps'),
      where('user_uid', '==', authUid)
    )
    const unsubscribe = onSnapshot(rsvpQuery, (snapshot) => {
      setUserHasRsvp(!snapshot.empty)
    })
    return () => unsubscribe()
  }, [authUid, firestoreReady])

  useEffect(() => {
    const load = async () => {
      const [
        clubsData,
        websitesData,
        reviewsData,
        constellationsData,
        profilesData,
        eventsData,
      ] = await Promise.all([
        loadJson<Club[]>('/data/clubs.json'),
        loadJson<Website[]>('/data/websites.json'),
        loadJson<Review[]>('/data/reviews.json'),
        loadJson<Constellation[]>('/data/constellations.json'),
        loadJson<Profile[]>('/data/profiles.json'),
        loadJson<Event[]>('/data/events.json'),
      ])

      setClubs(clubsData ?? [])
      setWebsites(websitesData ?? [])
      setReviews(reviewsData ?? [])
      setPosts([])
      setConstellations(constellationsData ?? [])
      setProfiles(profilesData ?? [])
      setEvents(eventsData ?? [])
    }

    load()
  }, [])

  useEffect(() => {
    if (!firebaseConfigured || !firestoreReady || !firestoreRef.current) {
      return
    }
    const db = firestoreRef.current
    const postsQuery = query(collection(db, 'blog_posts'), where('status', '==', 'published'))
    const unsubscribePosts = onSnapshot(postsQuery, (snapshot) => {
      const next = snapshot.docs
        .map((docSnap) => parseBlogPost(docSnap.data() as Record<string, unknown>, docSnap.id))
        .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
      setPosts(next)
    })
    return () => unsubscribePosts()
  }, [firebaseConfigured, firestoreReady])

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
      setPendingBlogPosts([])
      return
    }
    const db = firestoreRef.current
    const pendingPostsQuery = query(
      collection(db, 'blog_posts'),
      where('status', '==', 'pending')
    )
    const unsubscribe = onSnapshot(pendingPostsQuery, (snapshot) => {
      const next = snapshot.docs.map((docSnap) =>
        parseModerationPost(docSnap.data() as Record<string, unknown>, docSnap.id)
      )
      setPendingBlogPosts(next)
    })

    return () => unsubscribe()
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
        birthDateTimestamp: Timestamp.fromDate(new Date(birthDate)),
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
        birthDateTimestamp: Timestamp.fromDate(new Date(birthDate)),
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
      const birthDateTimestamp = birthDate
        ? Timestamp.fromDate(new Date(birthDate))
        : null
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
          birthDateTimestamp,
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

  const handleAccountDelete = async () => {
    if (!authRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    const user = authRef.current.auth.currentUser
    if (!user) {
      return { ok: false, message: languageCopy.review_signin_required }
    }
    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = (await response.json()) as { ok?: boolean; message?: string }
      if (!response.ok || !data.ok) {
        return {
          ok: false,
          message: data.message || languageCopy.delete_account_status_error,
        }
      }
      await signOut(authRef.current.auth)
      return { ok: true, message: languageCopy.delete_account_status_success }
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.delete_account_status_error
      return { ok: false, message }
    }
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
      const pairKey = getRelationshipPairKey(user.uid, targetUid)
      const existingPair = await getDoc(doc(db, 'relationship_links', pairKey))
      if (existingPair.exists()) {
        return { ok: false, message: languageCopy.link_request_status_exists }
      }
      const targetData = targetDoc.data() as Record<string, unknown>
      await setDoc(doc(db, 'relationship_links', pairKey), {
        pair_key: pairKey,
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

  const handleEventCheckin = async ({
    token,
    eventSlug,
  }: {
    token: string
    eventSlug: string
  }) => {
    if (!authRef.current) {
      return { ok: false, message: languageCopy.auth_status_config }
    }
    const user = authRef.current.auth.currentUser
    if (!user) {
      return { ok: false, message: languageCopy.review_signin_required }
    }
    try {
      const idToken = await user.getIdToken()
      const response = await fetch('/api/events/checkin', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, eventSlug }),
      })
      const data = (await response.json()) as { ok?: boolean; message?: string }
      if (!response.ok || !data.ok) {
        return {
          ok: false,
          message: data.message || languageCopy.event_checkin_error,
        }
      }
      return { ok: true, message: data.message || languageCopy.event_checkin_success }
    } catch (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: string }).message)
          : languageCopy.event_checkin_error
      return { ok: false, message }
    }
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

  const handleBlogModeration = async (
    postId: string,
    status: 'published' | 'pending' | 'rejected'
  ) => {
    if (!firestoreRef.current || !authEmail) {
      return
    }
    const update: Record<string, unknown> = {
      status,
      reviewed_at: serverTimestamp(),
      reviewed_by: authEmail,
    }
    if (status === 'published') {
      update.published_at = serverTimestamp()
    }
    await updateDoc(doc(firestoreRef.current, 'blog_posts', postId), update)
  }

  const handleBlogSave = async (details: {
    id?: string
    slug: string
    title: LocalizedText | string
    date: LocalizedText | string
    excerpt: LocalizedText | string
    meta: [LocalizedText | string, LocalizedText | string]
    body: LocalizedText | string
    legacy_url?: string
    status: 'published' | 'pending'
  }) => {
    if (!firestoreRef.current || !authEmail || !isAdmin) {
      return { ok: false, message: languageCopy.admin_access_denied_body }
    }
    const docId = details.id || details.slug
    if (!docId) {
      return { ok: false, message: languageCopy.admin_blog_save_error }
    }
    const update: Record<string, unknown> = {
      slug: details.slug,
      title: details.title,
      date: details.date,
      excerpt: details.excerpt,
      meta: details.meta,
      body: details.body,
      legacy_url: details.legacy_url || '',
      status: details.status,
      updated_at: serverTimestamp(),
      updated_by: authEmail,
    }
    if (details.status === 'published') {
      update.published_at = serverTimestamp()
    }
    const docRef = doc(firestoreRef.current, 'blog_posts', docId)
    const snapshot = await getDoc(docRef)
    if (!snapshot.exists()) {
      update.created_at = serverTimestamp()
      update.created_by = authEmail
    }
    await setDoc(docRef, update, { merge: true })
    return { ok: true, message: languageCopy.admin_blog_save_success }
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
    handleBlogModeration,
    handleBlogSave,
    pendingReviews,
    pendingBlogPosts,
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
    handleAccountDelete,
    safetyMode,
    setSafetyMode,
    userHasRsvp,
    handleLinkRequest,
    handleLinkResponse,
    handleLinkVisibility,
    subscribeEventRsvps,
    handleEventRsvpSubmit,
    handleEventRsvpUpdate,
    handleEventCheckin,
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
          <Route path="blog/:slug" element={<BlogPostPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="profiles/:slug" element={<PublicProfilePage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="guidelines" element={<GuidelinesPage />} />
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="reviews" element={<AdminReviewsPage />} />
            <Route path="blog" element={<AdminBlogPage />} />
            <Route path="verification" element={<AdminVerificationPage />} />
            <Route path="events" element={<AdminEventsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      ))}
      <Route path="*" element={<Navigate to="/en" replace />} />
    </Routes>
  )
}

export default App
