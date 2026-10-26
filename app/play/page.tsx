import { Suspense } from "react";
import { PlayScreen } from "@/components/play-screen";

export default function Page({ searchParams }: PageProps<"/play">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-game-bg" />}>
      {searchParams.then(({ game }) => (
        <PlayScreen gameId={typeof game === "string" ? game : undefined} />
      ))}
    </Suspense>
  );
}
