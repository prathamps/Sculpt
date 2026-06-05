# Sculpt
(A tech demo project inspired by frame.io)
Sculpt is a powerful real-time image collaboration platform that streamlines the process of giving and receiving visual feedback. Born from the frustration of exchanging countless screenshots with annotations across different chat apps, Sculpt brings order to the chaos of visual communication.

## What is Sculpt?

Sculpt is where design meets collaboration. It's a specialized platform that enables teams to:

- **Annotate images** with intuitive drawing tools
- **Comment directly on visuals** with precise location markers
- **Track versions** of images as they evolve
- **Collaborate in real-time** with team members
- **Organize projects** with clear hierarchy and permissions

## Why Sculpt?

The problem is familiar: you share a screenshot, someone replies with text feedback, you misunderstand which part they're referring to, they draw over your image in another app, send it back... and the cycle of confusion continues.

Sculpt solves this by creating a single source of truth for visual collaboration:

- **Contextual feedback**: Comments tied directly to specific parts of an image
- **Version control**: Track changes over time without losing history
- **Real-time collaboration**: See team activity as it happens
- **Organized projects**: Keep related images together with proper access control

## Core Features

### Precise Annotation Tools

- **Drawing tools**: Pencil, rectangle, and line tools for clear visual communication
- **Color options**: Highlight different feedback types with distinct colors
- **Annotation history**: Undo/redo support for annotation iterations

### Smart Comment System

- **Location-aware comments**: Tie feedback to exact coordinates on images
- **Threaded replies**: Have focused discussions on specific points
- **Resolution tracking**: Mark comments as resolved when addressed
- **Like/reaction system**: Quick acknowledgment of feedback

### Version Control

- **Image versioning**: Upload new versions while preserving feedback history
- **Version comparison**: See how designs evolve over time
- **Version naming**: Give context to each iteration

### Team Collaboration

- **Real-time updates**: See annotations and comments as they happen
- **Role-based permissions**: Control who can view, comment, or edit
- **Shareable links**: Bring external stakeholders into the loop
- **Notifications**: Stay informed of project activity

### Project Organization

- **Project hierarchy**: Group related images logically
- **Team management**: Add and manage collaborators with appropriate permissions
- **Search and filter**: Quickly find what you need

## Technology Stack

Sculpt is built with a modern, scalable architecture:

- **Frontend**: Next.js with TypeScript
- **Backend**: Node.js with Express
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Socket.IO for live collaboration
- **Authentication**: Secure JWT-based auth system
- **Storage**: Cloud-based image storage and optimization

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL
- Redis (for Socket.IO adapter)
- pnpm package manager

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/sculpt.git
   cd sculpt
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   Create `.env` files in both `apps/api` and `apps/web` directories:

   **apps/api/.env**

   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/sculpt
   JWT_SECRET=your_jwt_secret
   REDIS_URL=redis://localhost:6379
   ```

   **apps/web/.env**

   ```
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

4. **Setup database**

   ```bash
   cd apps/api
   pnpm prisma migrate dev
   ```

5. **Start the development servers**
   ```bash
   # From the root directory
   pnpm dev
   ```

## Development

The project uses a monorepo structure with the following organization:

```
sculpt/
├── apps/
│   ├── api/       # Backend Express server
│   └── web/       # Next.js frontend
└── package.json   # Root workspace config
```

## Contributing

Contributions are welcome! If you're passionate about improving visual collaboration, we'd love your input on:

- New annotation tools and features
- Performance optimizations
- UI/UX improvements
- Documentation and examples
- Bug fixes and testing

## Vision

Sculpt aims to become the industry standard for visual feedback and collaboration. We're building a platform where creative teams can communicate their vision clearly, iterate rapidly, and produce their best work through seamless collaboration.

We believe that miscommunication is the enemy of great design, and Sculpt is our answer to this challenge. Join us in transforming how teams work with visual content!

## Premium & Platform Features

Beyond the core collaboration tools, Sculpt ships with:

### 🎬 Video annotation (frame-by-frame)

Upload videos alongside images. The viewer provides play/pause, scrubbing and
single-frame stepping, with the same pencil/rectangle/line tools overlaid on the
video. Each annotation and comment is **anchored to a video timestamp** — clicking
a comment's time badge seeks the player to that exact moment. Export the current
annotated frame as a PNG straight from the player. _(PRO)_

### 📤 Export annotations & reports

- **Annotated PNG** — download the image with your drawings burned in (client-side).
- **Reports** — `GET /api/export/image/:imageId/report.(json|csv)` produce a full
  report of every version, comment, resolution status, annotation count and video
  timestamp. The UI also offers a printable (PDF) report. _(reports are PRO)_

### 💳 Subscriptions (PRO plan) — Razorpay or Stripe

The billing provider is **pluggable and auto-detected**: set `RAZORPAY_*` keys to
use Razorpay (India-friendly, recurring Subscriptions), or `STRIPE_*` keys to use
Stripe. Razorpay takes precedence when both are present.

**Razorpay test-mode setup:** use `rzp_test_` keys, create a **Plan**
(Subscriptions → Plans) and set `RAZORPAY_PLAN_ID`. Configure a webhook pointing
at `…/api/subscriptions/razorpay/webhook` (events: `subscription.*`) and set
`RAZORPAY_WEBHOOK_SECRET`. Upgrade opens the in-page Razorpay Checkout modal; pay
with a test card (`4111 1111 1111 1111`, any future expiry/CVV), the server
verifies the signature, and webhooks keep the plan in sync. Cancel from the
billing page.

`FREE` vs `PRO` tiers are enforced server-side via a central limits table
(`src/lib/plans.ts`):

| | FREE | PRO |
|---|---|---|
| Projects | 3 | Unlimited |
| Members / project | 3 | Unlimited |
| Versions / file | 2 | Unlimited |
| Video annotation | — | ✓ |
| Report export | — | ✓ |

Checkout, the billing portal and webhook sync live under `/api/subscriptions`.
The webhook is mounted with a raw body for signature verification. Gated actions
return HTTP `402` with an upgrade hint; the UI surfaces an **Upgrade** prompt.

### ✉️ Email notifications for offline members

Socket presence is tracked per user. When a notification is generated for a user
who is **not currently connected**, it is also delivered by email (Nodemailer /
SMTP). Configure any SMTP provider; if unset, email is skipped gracefully.

### 🔐 OAuth login (Google & GitHub)

`Continue with Google / GitHub` buttons appear automatically when the
corresponding provider is configured. OAuth users are matched to existing
accounts by email or created on the fly, then issued the same JWT cookie as
password login.

### 🚦 CI pipeline

`.github/workflows/ci.yml` runs on every PR and push to `main`: it lints,
type-checks and builds both apps and validates the Prisma schema. Releasing
continues to use Railway (API) and Vercel (web) git auto-deploy. Run database
migrations on deploy with `npx prisma migrate deploy`.

## Configuration

Copy the example env files and fill in what you need — every integration above is
optional and degrades gracefully when its variables are absent:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Key API variables: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `FRONTEND_URL`,
`API_URL`, `REDIS_URL`, the `GOOGLE_*` / `GITHUB_*` OAuth pairs, the billing
block (`RAZORPAY_*` or `STRIPE_*`), and the `SMTP_*` block. See
`apps/api/.env.example` for the full list.

## License

[MIT](LICENSE)
