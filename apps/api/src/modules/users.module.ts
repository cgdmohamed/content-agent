import { BadRequestException, Body, ConflictException, Controller, Get, Module, Param, Patch, Post, Req } from "@nestjs/common";
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import bcrypt from "bcryptjs";
import { AuditService } from "../audit/audit.module.js";
import { DatabaseService } from "../database/database.module.js";
import { type AuthenticatedRequest, Roles } from "../security/access-control.js";
import { passwordPolicyIssues, strongPasswordMessage } from "../security/password-policy.js";

export const usersListLimit = 200;

class CreateUserDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsIn(["ADMIN", "EDITOR"])
  role!: "ADMIN" | "EDITOR";
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(["ADMIN", "EDITOR"])
  role?: "ADMIN" | "EDITOR";

  @IsOptional()
  @IsIn(["ACTIVE", "DISABLED"])
  status?: "ACTIVE" | "DISABLED";

  @IsOptional()
  @IsString()
  @MinLength(12)
  password?: string;
}

@Controller("users")
@Roles("ADMIN")
class UsersController {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService
  ) {}

  @Get()
  async list(): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.query(
      `SELECT id, name, email, role, status, created_at AS "createdAt", last_login_at AS "lastLoginAt"
       FROM users
       ORDER BY created_at DESC
       LIMIT ${usersListLimit}`
    );
    return result.rows;
  }

  @Post()
  async create(@Body() body: CreateUserDto, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    assertStrongPassword(body.password);
    const existing = await this.db.query<{ id: string }>("SELECT id FROM users WHERE lower(email) = lower($1)", [body.email]);
    if (existing.rowCount) throw new ConflictException("البريد الإلكتروني مستخدم بالفعل.");
    const hash = await bcrypt.hash(body.password, 12);
    const result = await insertUserOrThrowConflict(
      () =>
        this.db.query(
          `INSERT INTO users (name, email, password_hash, role)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, email, role, status, created_at AS "createdAt"`,
          [body.name, body.email, hash, body.role]
        )
    );
    await this.audit.record({
      actorUserId: request.user?.id,
      eventType: "USER_CREATED",
      message: "تم إنشاء مستخدم جديد",
      metadata: { userId: result.rows[0]?.id, email: body.email, role: body.role }
    });
    return result.rows[0] as Record<string, unknown>;
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: UpdateUserDto, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    if (Object.keys(body).length === 0) throw new BadRequestException("لا توجد تغييرات لحفظها.");
    const current = await this.db.query<{ id: string; role: "ADMIN" | "EDITOR"; status: "ACTIVE" | "DISABLED" }>(
      "SELECT id, role, status FROM users WHERE id = $1",
      [id]
    );
    if (!current.rowCount) throw new BadRequestException("المستخدم غير موجود.");
    if (body.password) assertStrongPassword(body.password);
    if (request.user?.id === id && body.status === "DISABLED") throw new BadRequestException("لا يمكنك تعطيل حسابك الحالي.");
    if (current.rows[0]!.role === "ADMIN" && body.role === "EDITOR") await this.assertAnotherActiveAdmin(id);
    if (current.rows[0]!.role === "ADMIN" && body.status === "DISABLED") await this.assertAnotherActiveAdmin(id);

    const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : null;
    const result = await this.db.query(
      `UPDATE users
       SET name = COALESCE($2, name),
           role = COALESCE($3, role),
           status = COALESCE($4, status),
           password_hash = COALESCE($5, password_hash),
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, email, role, status, created_at AS "createdAt", last_login_at AS "lastLoginAt"`,
      [
        id,
        body.name?.trim() || null,
        body.role ?? null,
        body.status ?? null,
        passwordHash
      ]
    );
    await this.audit.record({
      actorUserId: request.user?.id,
      eventType: "USER_UPDATED",
      message: "تم تحديث مستخدم",
      metadata: { userId: id, fields: publicUserUpdateFields(body) }
    });
    return result.rows[0] as Record<string, unknown>;
  }

  private async assertAnotherActiveAdmin(userId: string): Promise<void> {
    const result = await this.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' AND id <> $1",
      [userId]
    );
    if (Number(result.rows[0]?.count ?? 0) < 1) {
      throw new BadRequestException("يجب أن يبقى مدير نشط واحد على الأقل.");
    }
  }
}

function assertStrongPassword(password: string): void {
  const issues = passwordPolicyIssues(password);
  if (issues.length > 0) throw new BadRequestException(strongPasswordMessage(issues));
}

export function publicUserUpdateFields(body: UpdateUserDto): string[] {
  return Object.keys(body).filter((field) => field !== "password");
}

export async function insertUserOrThrowConflict<T>(insert: () => Promise<T>): Promise<T> {
  try {
    return await insert();
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictException("البريد الإلكتروني مستخدم بالفعل.");
    throw error;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
