import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { deleteUploadFiles, getPrimaryPath, getReplicaPath, safeUnlink } from '@/lib/storage';
import fs from 'fs';
import path from 'path';
import { isPastEndDate } from '@/lib/events';

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      name,
      description,
      language,
      maxFileSizeMB,
      guestGalleryEnabled,
      date,
      endDate,
      slug,
      isActive,
      action,
    } = body as {
      name?: string;
      description?: string | null;
      language?: string;
      maxFileSizeMB?: number;
      guestGalleryEnabled?: boolean;
      date?: string;
      endDate?: string | null;
      slug?: string | null;
      isActive?: boolean;
      /** Lifecycle shortcuts: enable | disable | archive | unarchive */
      action?: 'enable' | 'disable' | 'archive' | 'unarchive';
    };

    const existing = await prisma.event.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // ── Lifecycle actions ──────────────────────────────────────────────
    if (action) {
      let data: {
        isActive?: boolean;
        archivedAt?: Date | null;
      } = {};

      switch (action) {
        case 'disable':
          data = { isActive: false };
          break;
        case 'enable':
          if (existing.archivedAt) {
            return NextResponse.json(
              { error: 'Unarchive the event before enabling it.' },
              { status: 400 }
            );
          }
          if (isPastEndDate(existing.endDate)) {
            return NextResponse.json(
              {
                error:
                  'End date has passed. Edit the event and extend or clear the end date, then enable.',
              },
              { status: 400 }
            );
          }
          data = { isActive: true };
          break;
        case 'archive':
          data = { isActive: false, archivedAt: new Date() };
          break;
        case 'unarchive':
          data = { archivedAt: null, isActive: false };
          break;
        default:
          return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }

      const event = await prisma.event.update({
        where: { id: params.id },
        data,
      });
      return NextResponse.json(event);
    }

    // ── Field update ───────────────────────────────────────────────────
    const slugValue =
      slug === undefined ? undefined : slug ? String(slug).toLowerCase().trim() : null;

    if (slugValue) {
      if (!/^[a-z0-9-]+$/.test(slugValue)) {
        return NextResponse.json(
          { error: 'Invalid slug: use only letters, numbers, and hyphens.' },
          { status: 400 }
        );
      }
      const taken = await prisma.event.findUnique({ where: { slug: slugValue } });
      if (taken && taken.id !== params.id) {
        return NextResponse.json({ error: 'slug_taken' }, { status: 409 });
      }
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (language !== undefined) data.language = language;
    if (maxFileSizeMB !== undefined) data.maxFileSizeMB = maxFileSizeMB;
    if (guestGalleryEnabled !== undefined) data.guestGalleryEnabled = guestGalleryEnabled;
    if (date) data.date = new Date(date);
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
    if (slugValue !== undefined) data.slug = slugValue;

    if (isActive !== undefined) {
      if (isActive && existing.archivedAt) {
        return NextResponse.json(
          { error: 'Unarchive the event before enabling it.' },
          { status: 400 }
        );
      }
      data.isActive = Boolean(isActive);
    }

    // If end date is moved into the future and event was only "ended", leave isActive as-is
    // (admin can re-enable separately). If end date is set in the past, force inactive.
    if (endDate !== undefined) {
      const nextEnd = endDate ? new Date(endDate) : null;
      if (nextEnd && isPastEndDate(nextEnd)) {
        data.isActive = false;
      }
    }

    const event = await prisma.event.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(event);
  } catch (error) {
    console.error('Error updating event:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/events/[id]
 * Permanently delete event + all uploads (files + DB).
 * Requires header x-confirm-password = admin password.
 */
export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const confirmPassword = request.headers.get('x-confirm-password');
  if (!confirmPassword || confirmPassword !== getSetting('ADMIN_PASSWORD')) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: params.id },
      include: { uploads: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Delete all upload files (Mac + SSD)
    for (const upload of event.uploads) {
      deleteUploadFiles(upload.eventId, upload.id, upload.storedName);
    }

    // Cover + event dirs
    const coverRel = [
      `events/${event.id}/metadata/cover.bin`,
      `events/${event.id}/metadata/cover_meta.json`,
    ];
    for (const rel of coverRel) {
      safeUnlink(path.join(getPrimaryPath(), rel));
      const rep = getReplicaPath();
      if (rep) safeUnlink(path.join(rep, rel));
    }

    // Best-effort remove empty event folders
    for (const root of [getPrimaryPath(), getReplicaPath()].filter(Boolean) as string[]) {
      const eventDir = path.join(root, 'events', event.id);
      try {
        if (fs.existsSync(eventDir)) {
          fs.rmSync(eventDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.warn('[delete event] could not remove dir', eventDir, e);
      }
    }

    await prisma.event.delete({ where: { id: params.id } });

    return NextResponse.json({
      success: true,
      deletedUploads: event.uploads.length,
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
