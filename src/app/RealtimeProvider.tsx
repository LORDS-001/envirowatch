import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RealtimeClient } from "@/lib/realtime/client";
import { onSessionEnd } from "@/lib/auth/lifecycle";
import { useSession } from "@/lib/auth/session";

/** Holds the one shared live connection while a person is signed in. */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const userId = useSession((state) => state.user?.id);
  useEffect(() => {
    const client = new RealtimeClient(queryClient);
    const unregister = onSessionEnd(() => client.stop());
    client.start();
    return () => {
      unregister();
      client.stop();
    };
  }, [queryClient, userId]);
  return <>{children}</>;
}
