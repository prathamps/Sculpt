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

## License

[MIT](LICENSE)
