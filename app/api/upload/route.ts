import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { storageReady } from '@/lib/store';

export async function POST(request: Request) {
  if (!storageReady()) {
    return NextResponse.json({ error: 'Storage is not set up yet (missing BLOB_READ_WRITE_TOKEN).' }, { status: 503 });
  }
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('uploads/')) throw new Error('Invalid upload path');
        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
          maximumSizeInBytes: 10 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
