# CrowdSnap

CrowdSnap is a high-performance, self-hosted media drop application designed for weddings and private events. It empowers event hosts to collect full-resolution memories directly from their guests' phones via QR codes, streaming uploads directly to your local hardware without ever touching public cloud storage.

## Features

- **Guest Upload UI**: A beautiful, frictionless dropzone accessible via mobile browser. No app required.
- **Client-Side Upload Queuing**: Intelligently batches guest uploads sequentially to guarantee the server is never overwhelmed, gracefully handling 5,000+ photo drops dynamically.
- **Global Multi-Language Support (i18n)**: Fully localized natively in 7 languages (English, Dutch, Spanish, French, German, Italian, Portuguese) automatically inherited from browser settings or customized via toggles.
- **Local Native Storage**: Files stream directly from the HTTP request into native local disk folders via `busboy`, achieving zero memory-loading bloat.
- **Admin Dashboard**: NextAuth-protected control panel to create events, manage drop links, set max upload file limits, monitor total disk storage capacity, and safely delete files.
- **QR Code Exporter**: Natively renders, customizes (White/Black/Transparent background matching), and exports high-resolution scalable vectors (SVG) or PNGs of the drop link QR code for direct printing.
- **Streaming ZIP Exports**: Admins can download an entire event containing thousands of raw photos as a single packaged `.zip` file—streamed natively to avoid RAM spikes on the Next.js server.

## Tech Stack

This project is built using modern production-grade architecture:

- **Framework**: [Next.js 16.1.6](https://nextjs.org/) (App Directory) & React 19
- **Authentication**: [NextAuth 4.24](https://next-auth.js.org/)
- **Database Architecture**: [Prisma 7.4.1](https://www.prisma.io/)
- **Database Engine**: PostgreSQL running via Docker (`pg` driver)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) + custom [shadcn/ui](https://ui.shadcn.com/) components
- **Animations**: [Framer Motion 12.34](https://www.framer.com/motion/)
- **Image Processing**: [Sharp 0.34](https://sharp.pixelplumbing.com/) (for generating instant grid thumbnails)
- **Streaming Pipeline**: `busboy` (for raw multipart data) + `archiver` (for ZIP streaming)

## Security Assurances

CrowdSnap is designed for **100% data ownership**:

- There is no `/public` fallback. Files are stored securely in a local `/storage` volume on the server.
- The guest facing pages (`/p/[eventId]`) have _no endpoints available_ to read or list files. A guest can only blindly drop files in.
- The Admin pages (`/admin`) use absolute file-system read streams protected completely by secure `NextAuth` sessions.

## Setup Instructions

1. **Clone the repository** and install dependencies:
   ```bash
   npm install
   ```
2. **Setup your environment variables**:
   Create a `.env` file in the root based on your desired configuration. (Ensure `DATABASE_URL`, `NEXTAUTH_SECRET`, and `ADMIN_PASSWORD` are defined).
3. **Start the Database**:
   ```bash
   docker compose up -d
   ```
4. **Push Database Schema**:
   ```bash
   npx prisma db push
   ```
5. **Start the Development Server**:
   ```bash
   npm run dev
   ```

Explore your new local environment at `http://localhost:3000/admin`.
