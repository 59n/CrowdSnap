import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import fs from 'fs';
import { getFilePath, initEventStorage } from '@/lib/storage';

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await props.params;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || !file.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Invalid file type. Only images are allowed.' }, { status: 400 });
    }

    initEventStorage(id);
    
    // Convert to buffer and save
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Save as cover.jpg or whatever extension
    const coverPath = getFilePath(id, 'metadata', 'cover.bin');
    fs.writeFileSync(coverPath, buffer);

    // Also write mime type so we can serve it later
    const metaPath = getFilePath(id, 'metadata', 'cover_meta.json');
    fs.writeFileSync(metaPath, JSON.stringify({ mimeType: file.type }));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error uploading cover image:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
