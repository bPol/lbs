# Roadmap / TODO

Status key: done, partial, in-progress, pending

## Epic 1: Core Architecture (Constellations & Users)

| ID | Task | Status | Notes |
| --- | --- | --- | --- |
| CORE-01 | Database Schema: Constellations (Many-to-Many) | done | Deterministic pair key enforces unique A-B links. |
| CORE-02 | API: Link Request Workflow | done | Link request/accept flow implemented in profile UI + Firestore writes. |
| CORE-03 | Frontend: Visual Constellation Graph | done | Force layout via d3-force with clickable nodes. |

## Epic 2: Party & Event Management

| ID | Task | Status | Notes |
| --- | --- | --- | --- |
| EVT-01 | Event Privacy Tiers Logic | done | Privacy tiers and visibility filtering exist. |
| EVT-02 | QR Code Ticketing System | done | QR token + host check-in endpoint + host dashboard form. |
| EVT-03 | Fuzzy Geolocation for Search | done | Fuzzy coords stored for profiles + approximate event coords shown when hidden. |

## Epic 3: UX & Interface Polish

| ID | Task | Status | Notes |
| --- | --- | --- | --- |
| UX-01 | Mobile Bottom Navigation | done | Mobile nav added; desktop nav hidden on small screens. |
| UX-02 | Safety Mode (Blur Toggle) | done | Global blur toggle with hover/tap reveal. |
| UX-03 | Onboarding Empty State Guide | done | Checklist + progress bar on profile until completed. |

## Epic 4: SEO & Growth

| ID | Task | Status | Notes |
| --- | --- | --- | --- |
| SEO-01 | Programmatic City Landing Pages | done | City events view at /events/[city_slug] with dynamic title. |
| SEO-02 | Schema.org Structure | done | JSON-LD for Organization + Event detail pages. |

## Epic 5: Compliance & Safety (Mandatory)

| ID | Task | Status | Notes |
| --- | --- | --- | --- |
| LEG-01 | Strict Age Gating (2-Step) | done | Splash gate + Firestore create rule enforce 18+. |
| LEG-02 | EXIF Data Stripper | done | Middleware uses Sharp to strip metadata before save. |
| LEG-03 | GDPR Hard Delete | done | Delete account UI + server cascade delete + upload cleanup + webhook. |
| LEG-04 | Terms of Service Clickwrap | done | Unticked checkbox required before submit. |

## Various : 
* Submit a club for logged in users only (done)
* Fix the blog posts, right now not working (done)
* Add functionnality for agent to do e2e tests
* Run lighthouse on the main public pages and apply suggestions
* How to achieve email notifications
