import { Body, Controller, Get, HttpException, HttpStatus, Injectable, Module, OnModuleInit, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import bcrypt from "bcryptjs";
import type { CookieOptions, Request, Response } from "express";
import { AuditService } from "../audit/audit.module.js";
import { DatabaseService } from "../database/database.module.js";
import { Public } from "../security/access-control.js";
import { LoginRateLimiter } from "../security/login-rate-limit.js";
import { fieldLimits } from "../security/payload-limits.js";
import { passwordPolicyIssues, strongPasswordMessage } from "../security/password-policy.js";
import { createSessionCookie, parseSessionCookie, type SessionUser } from "../security/session-cookie.js";

class LoginDto {
  @IsEmail()
  @MaxLength(fieldLimits.email)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(fieldLimits.password)
  password!: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "ADMIN" | "EDITOR";
  status: "ACTIVE" | "DISABLED";
}

type CookieRequest = Request & { cookies?: Record<string, string | undefined> };

const SESSION_COOKIE_NAME = "content_agent_session";
const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const loginRateLimiter = new LoginRateLimiter();

@Injectable()
class AuthService implements OnModuleInit {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrapAdmin();
  }

  async bootstrapAdmin(): Promise<void> {
    const count = await this.db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM users");
    if (Number(count.rows[0]?.count ?? 0) > 0) return;
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !password) return;
    const passwordIssues = passwordPolicyIssues(password);
    if (passwordIssues.length > 0) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD غير آمن. ${strongPasswordMessage(passwordIssues)}`);
    const hash = await bcrypt.hash(password, 12);
    await this.db.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'ADMIN')",
      ["مدير النظام", email, hash]
    );
  }

  async login(email: string, password: string, ip: string): Promise<Omit<SessionUser, "exp">> {
    this.assertLoginAllowed(email, ip);
    const result = await this.db.query<UserRow>(
      "SELECT id, name, email, password_hash, role, status FROM users WHERE lower(email) = lower($1)",
      [email]
    );
    const user = result.rows[0];
    if (!user || user.status !== "ACTIVE") {
      this.recordFailedLogin(email, ip);
      await this.recordLoginFailed(email);
      throw new UnauthorizedException("بيانات الدخول غير صحيحة");
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      this.recordFailedLogin(email, ip);
      await this.recordLoginFailed(email);
      throw new UnauthorizedException("بيانات الدخول غير صحيحة");
    }
    loginRateLimiter.clear({ email, ip });
    await this.db.query("UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1", [user.id]);
    await this.audit.record({
      actorUserId: user.id,
      eventType: "AUTH_LOGIN_SUCCEEDED",
      message: "تم تسجيل الدخول بنجاح",
      metadata: { email: user.email }
    });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  me(request: CookieRequest): SessionUser | null {
    return parseSessionCookie(request.cookies?.content_agent_session);
  }

  async recordLogout(user: SessionUser): Promise<void> {
    await this.audit.record({
      actorUserId: user.id,
      eventType: "AUTH_LOGOUT",
      message: "تم تسجيل الخروج",
      metadata: { email: user.email }
    });
  }

  private async recordLoginFailed(email: string): Promise<void> {
    await this.audit.record({
      eventType: "AUTH_LOGIN_FAILED",
      message: "فشلت محاولة تسجيل دخول",
      metadata: { email: this.loginKey(email) }
    });
  }

  private assertLoginAllowed(email: string, ip: string): void {
    try {
      loginRateLimiter.assertAllowed({ email, ip });
    } catch {
      throw new HttpException("محاولات دخول كثيرة. حاول مرة أخرى بعد قليل.", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordFailedLogin(email: string, ip: string): void {
    loginRateLimiter.recordFailure({ email, ip });
  }

  private loginKey(email: string): string {
    return email.trim().toLowerCase();
  }
}

@Controller("auth")
class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @Public()
  async login(@Body() body: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<{ user: Omit<SessionUser, "exp"> }> {
    const user = await this.auth.login(body.email, body.password, clientIp(request));
    response.cookie(SESSION_COOKIE_NAME, createSessionCookie(user), sessionCookieOptions());
    return { user };
  }

  @Post("logout")
  async logout(@Req() request: CookieRequest, @Res({ passthrough: true }) response: Response): Promise<{ ok: true }> {
    const user = this.auth.me(request);
    response.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions());
    if (user) await this.auth.recordLogout(user);
    return { ok: true };
  }

  @Get("me")
  @Public()
  me(@Req() request: CookieRequest): SessionUser | null {
    return this.auth.me(request);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}

function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    path: "/"
  };
}

function clearSessionCookieOptions(): CookieOptions {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions();
  return options;
}

function clientIp(request: Request): string {
  return request.ip || "unknown";
}
