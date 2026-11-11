import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RealtimeClient } from "@/lib/realtime/client";

/** Holds the one shared live connection while a person is signed in. */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const client = new RealtimeClient(queryClient);
    client.start();
    return () => client.stop();
  }, [queryClient]);
  return <>{children}</>;
}
