# Instructions for the Development Team

This document captures the product requirements and technical direction for the
next build phase.

## A. Implementing "Constellations" (Relationship Graphs)

Traditional sites use a "Couple" or "Single" toggle. LedBySwing needs a graph-
based relationship model.

### Database Structure

Use a graph-friendly model:

- Profiles
  - Standard user profile fields.
- Relationship_Links
  - User_A
  - User_B
  - Link_Type: Primary | Play Partner | Polycule Member
  - Status: Pending | Confirmed

### Linking Flow

- User A sends a "Link Request" to User B.
- User B must accept (mandatory mutual consent).
- Once linked, the UI offers:
  - Merge Search Visibility (show as a unit in search), or
  - Independent but Linked (separate search cards with a visible link)

### Constellation View

- Build a dynamic front-end component (D3.js or similar) that maps a user's
  polycule graph.
- Nodes represent profiles; edges represent relationship links.
- Clicking a node navigates to that profile.
- Keep the component resilient to sparse or partial data.

## B. Party & Event Management

### Event Gating Logic

Implement three privacy tiers:

- Public: visible to all
- Vetted: visible to all, address hidden until host approves RSVP
- Private: invite-only/secret

### Vetting System

- Hosts need a "Guest Manager" dashboard for RSVPs.
- Include "Trust Badges" such as "Attended 3+ parties without incident."
- Badges should be computed from real attendance data.

### Ticketing / RSVP

- Use a free RSVP system with a cap per category (example: 20 men, 20 women, 10
  couples).
- Generate a unique privacy-safe QR code per guest for door check-in.
- QR codes should map to a server-side RSVP record; avoid embedding user data in
  the QR payload.

## C. Suggested Technical & UX Improvements

### 1) Metadata Stripping (Privacy Priority)

- Implement backend middleware (Sharp or ImageMagick) that strips all EXIF/GPS
  data from uploaded photos before storage.
- Treat as non-negotiable safety requirement.

### 2) "Fuzzy" Geolocation

- Store exact coordinates for event locations.
- For user profiles, API returns coordinates rounded to ~1km to reduce
  stalking risk.

### 3) Real-Time Interactions

- Use WebSockets (Socket.io) for messaging and live event updates.
- If a party is "Full" or "Last Call," guests see updates instantly.

### 4) Mobile-First "Web App" (PWA)

- Build as a PWA (Add to Home Screen).
- Enable push notifications for party invites without app store dependency.

### 5) Verification Tiers

- Add "Photo Verification" requiring a real-time selfie holding a specific
  word.
- Start with manual admin review to establish trust.
