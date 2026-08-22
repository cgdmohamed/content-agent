import { BadRequestException, Body, Controller, Get, Injectable, Module, Patch, Req } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { AuditService } from "../audit/audit.module";
import { DatabaseService } from "../database/database.module";
import { type AuthenticatedRequest, Roles } from "../security/access-control";
import { fieldLimits } from "../security/payload-limits";

const textProviders = ["anthropic", "openai", "perplexity"] as const;
type TextProviderName = (typeof textProviders)[number];

interface ProviderRoutingSettings {
  ideas?: TextProviderName[];
  research?: TextProviderName[];
  writing?: TextProviderName[];
}

interface StoredSettings {
  monthlyAiBudgetUsd?: number;
  monthlyAiHardLimitUsd?: number;
  defaultIdeasCount?: number;
  defaultMarket?: string;
  autoPublishAfterApproval?: boolean;
  providerRouting?: ProviderRoutingSettings;
}

interface ProviderPublicStatus {
  configured: boolean;
  maskedKey: string | null;
  model: string | null;
}

class ProviderRoutingDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(3)
  @IsIn(textProviders, { each: true })
  ideas?: TextProviderName[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(3)
  @IsIn(textProviders, { each: true })
  research?: TextProviderName[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(3)
  @IsIn(textProviders, { each: true })
  writing?: TextProviderName[];
}

class UpdateSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAiBudgetUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAiHardLimitUsd?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  defaultIdeasCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.market)
  defaultMarket?: string;

  @IsOptional()
  @IsBoolean()
  autoPublishAfterApproval?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProviderRoutingDto)
  providerRouting?: ProviderRoutingDto;
}

@Injectable()
class SettingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService
  ) {}

  async getSettings(): Promise<Record<string, unknown>> {
    return this.publicSettings(await this.readStoredSettings());
  }

  async getContentDefaults(): Promise<Record<string, unknown>> {
    const settings = await this.readStoredSettings();
    return {
      defaultIdeasCount: settings.defaultIdeasCount ?? 5,
      defaultMarket: settings.defaultMarket ?? "SA"
    };
  }

  async updateSettings(body: UpdateSettingsDto, request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    const current = await this.readStoredSettings();
    const next: StoredSettings = {
      ...current,
      ...body,
      defaultMarket: body.defaultMarket?.trim() || current.defaultMarket || "SA",
      providerRouting: normalizeProviderRouting(body.providerRouting ?? current.providerRouting)
    };
    assertBudgetLimits(next);
    await this.db.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('production_settings', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(next)]
    );
    await this.audit.record({
      actorUserId: request.user?.id,
      eventType: "SETTINGS_UPDATED",
      message: "تم تحديث إعدادات النظام",
      metadata: { fields: Object.keys(body) }
    });
    return this.publicSettings(next);
  }

  private async readStoredSettings(): Promise<StoredSettings> {
    const result = await this.db.query<{ value: StoredSettings }>(
      "SELECT value FROM system_settings WHERE key = 'production_settings'"
    );
    return result.rows[0]?.value ?? {};
  }

  private publicSettings(settings: StoredSettings): Record<string, unknown> {
    const monthlyAiBudgetUsd = settings.monthlyAiBudgetUsd ?? Number(process.env.MONTHLY_AI_BUDGET_USD ?? 30);
    const monthlyAiHardLimitUsd = effectiveHardLimit(monthlyAiBudgetUsd, settings.monthlyAiHardLimitUsd ?? Number(process.env.MONTHLY_AI_HARD_LIMIT_USD ?? 40));
    return {
      monthlyAiBudgetUsd,
      monthlyAiHardLimitUsd,
      defaultIdeasCount: settings.defaultIdeasCount ?? 5,
      defaultMarket: settings.defaultMarket ?? "SA",
      autoPublishAfterApproval: settings.autoPublishAfterApproval ?? false,
      providerRouting: normalizeProviderRouting(settings.providerRouting),
      providers: {
        openai: providerStatus(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
        anthropic: providerStatus(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest"),
        perplexity: providerStatus(process.env.PERPLEXITY_API_KEY, process.env.PERPLEXITY_MODEL ?? "sonar-pro"),
        gemini: providerStatus(process.env.GEMINI_API_KEY, process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image")
      }
    };
  }
}

function providerStatus(secret: string | undefined, model: string): ProviderPublicStatus {
  const maskedKey = maskSecretTail(secret);
  return {
    configured: Boolean(maskedKey),
    maskedKey,
    model: maskedKey ? model : null
  };
}

export function maskSecretTail(secret: string | undefined): string | null {
  const trimmed = secret?.trim();
  if (!trimmed) return null;
  const visibleTail = trimmed.slice(-4);
  return `••••••••${visibleTail}`;
}

export function assertBudgetLimits(settings: StoredSettings): void {
  const monthlyBudget = settings.monthlyAiBudgetUsd ?? Number(process.env.MONTHLY_AI_BUDGET_USD ?? 30);
  const hardLimit = settings.monthlyAiHardLimitUsd ?? Number(process.env.MONTHLY_AI_HARD_LIMIT_USD ?? 40);
  if (hardLimit > 0 && hardLimit < monthlyBudget) {
    throw new BadRequestException("الحد الصارم للذكاء الاصطناعي يجب ألا يقل عن الميزانية الشهرية.");
  }
}

export function effectiveHardLimit(monthlyBudget: number, hardLimit: number): number {
  if (hardLimit <= 0) return 0;
  return Math.max(monthlyBudget, hardLimit);
}

function normalizeProviderRouting(routing?: ProviderRoutingSettings): Required<ProviderRoutingSettings> {
  return {
    ideas: sanitizeProviderChain(routing?.ideas, ["perplexity", "openai", "anthropic"]),
    research: sanitizeProviderChain(routing?.research, ["perplexity", "anthropic", "openai"]),
    writing: sanitizeProviderChain(routing?.writing, ["anthropic", "openai"])
  };
}

function sanitizeProviderChain(value: unknown, fallback: TextProviderName[]): TextProviderName[] {
  if (!Array.isArray(value)) return fallback;
  const unique = value.filter((provider, index): provider is TextProviderName => textProviders.includes(provider) && value.indexOf(provider) === index);
  return unique.length > 0 ? unique : fallback;
}

@Controller("settings")
class SettingsDefaultsController {
  constructor(private readonly settings: SettingsService) {}

  @Get("content-defaults")
  async contentDefaults(): Promise<Record<string, unknown>> {
    return this.settings.getContentDefaults();
  }
}

@Controller("settings")
@Roles("ADMIN")
class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get(): Promise<Record<string, unknown>> {
    return this.settings.getSettings();
  }

  @Patch()
  async update(@Body() body: UpdateSettingsDto, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.settings.updateSettings(body, request);
  }
}

@Module({ controllers: [SettingsDefaultsController, SettingsController], providers: [SettingsService] })
export class SettingsModule {}
