import { useOutletContext } from "react-router-dom";
import type { SessionUserDto } from "./api/client";

export function useCurrentUser(): SessionUserDto {
  return useOutletContext<{ user: SessionUserDto }>().user;
}
