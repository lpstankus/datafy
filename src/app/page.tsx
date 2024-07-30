import Link from "next/link";
import { getServerAuthSession } from "~/server/auth";
import { api } from "~/trpc/server";

export default async function Home() {
  const session = await getServerAuthSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16 ">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          Create <span className="text-[hsl(280,100%,70%)]">T3</span> App
        </h1>
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-col items-center justify-center gap-4">
            <p className="text-center text-2xl text-white">
              {session && <span>Logged in as {session.user?.name}</span>}
            </p>
            <Link
              href={session ? "/api/auth/signout" : "/api/auth/signin"}
              className="rounded-full bg-white/10 px-10 py-3 font-semibold no-underline transition hover:bg-white/20"
            >
              {session ? "Sign out" : "Sign in"}
            </Link>
          </div>
        </div>

        <CrudShowcase/>
      </div>
    </main>
  );
}

async function CrudShowcase() {
  const trackList = await api.spotify.retrieveMostPlayed();
  if (!trackList) return (
    <div>
      <p className="truncate">User not logged in...</p>
    </div>
  )

  return (
    <div className="w-full max-w-md">
      <p className="font-bold">Artists:</p>
      <div>
        {trackList.artist_data.map((obj, _) =>
          <div className="py-2">
            <p className="truncate">{obj.name} ({obj.popularity}/100 - {obj.followers} followers)</p>
            <p className="truncate">{obj.genres.join(", ")}</p>
          </div>
        )}
      </div>

      <p className="font-bold pt-10">Tracks:</p>
      <div>
        {trackList.track_data.map((obj, _) =>
          <div className="py-2">
            <p className="truncate">{obj.track_name} - {obj.album_name} ({obj.popularity}/100)</p>
            <p className="truncate">{obj.genres.join(", ")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
