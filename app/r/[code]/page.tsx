import { Suspense } from "react";
import { GuestJoin } from "@/components/guest-join";

export default function Page({ params }: PageProps<"/r/[code]">) {
  return (
    <Suspense fallback={null}>
      {params.then(({ code }) => (
        <GuestJoin code={code.toUpperCase()} />
      ))}
    </Suspense>
  );
}
