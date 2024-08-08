import { NextResponse } from "next/server";
import { api } from "~/trpc/server";
import { env } from "~/env";

export async function GET(request: Request) {
  if (request.headers.get("Authorization") !== `Bearer ${env["CRON_SECRET"]}`) {
    return NextResponse.json({ body: "Unauthorized" }, { status: 401 });
  }

  let idList = env["TRACKED_USERS_IDS"].split(",").filter((str) => str.length > 0);
  try {
    for (let userId of idList) await api.spotify.snapshotUser({ userId });
    return NextResponse.json({ body: "Exited successfully!" });
  } catch (e) {
    return NextResponse.json({ body: e }, { status: 500 });
  }
}
