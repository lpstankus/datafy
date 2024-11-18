import { NextResponse } from 'next/server';
import { api } from '~/trpc/server';
import { env } from '~/env';

export async function GET(request: Request) {
  if (request.headers.get('Authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ body: 'Unauthorized' }, { status: 401 });
  }

  const userIds = env.TRACKED_USERS_IDS.split(',').filter((str) => str.length > 0);
  try {
    await api.spotify.snapshotUsers({ userIds });
    return NextResponse.json({ body: 'Exited successfully!' });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ body: e }, { status: 500 });
  }
}
