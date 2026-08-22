import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { loadEnv } from "@content-agent/config";
import type { Request } from "express";
import { parseSessionCookie, type SessionUser } from "./session-cookie.js";

export const PUBLIC_ROUTE = "publicRoute";
export const ROLES = "roles";

export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(PUBLIC_ROUTE, true);
export const Roles = (...roles: Array<SessionUser["role"]>): ReturnType<typeof SetMetadata> => SetMetadata(ROLES, roles);

export type AuthenticatedRequest = Request & {
  cookies?: Record<string, string | undefined>;
  user?: SessionUser;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = parseSessionCookie(request.cookies?.content_agent_session);
    if (!user) throw new UnauthorizedException("يجب تسجيل الدخول أولًا.");
    this.assertTrustedWriteOrigin(request);

    const allowedRoles = this.reflector.getAllAndOverride<Array<SessionUser["role"]>>(ROLES, [context.getHandler(), context.getClass()]);
    if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
      throw new ForbiddenException("ليست لديك صلاحية لتنفيذ هذا الإجراء.");
    }
    request.user = user;
    return true;
  }

  private assertTrustedWriteOrigin(request: AuthenticatedRequest): void {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) return;
    const env = loadEnv();
    const allowed = env.PUBLIC_WEB_URL;
    const source = request.get("origin") ?? request.get("referer");
    if (!source && env.NODE_ENV !== "production") return;
    if (!isTrustedWriteSource(source, allowed)) throw new ForbiddenException("مصدر الطلب غير موثوق.");
  }
}

function originOf(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function isTrustedWriteSource(source: string | undefined, allowed: string): boolean {
  if (!source) return false;
  return originOf(source) === originOf(allowed);
}
