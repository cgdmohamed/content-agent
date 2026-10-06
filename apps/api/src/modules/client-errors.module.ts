import { Body, Controller, HttpCode, Logger, Module, Post, Req } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { type AuthenticatedRequest } from "../security/access-control.js";
import type { RequestWithId } from "../security/request-id.js";

export const clientErrorLimits = { message: 500, stack: 4000, componentStack: 4000, url: 500 } as const;

class ClientErrorDto {
  @IsString()
  @MaxLength(clientErrorLimits.message)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(clientErrorLimits.stack)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(clientErrorLimits.componentStack)
  componentStack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(clientErrorLimits.url)
  url?: string;
}

/** Single-line JSON so log shippers keep it as one event; control characters from user-controlled text are removed. */
export function formatClientError(body: ClientErrorDto, context: { userId?: string; requestId?: string }): string {
  const clean = (value: string | undefined): string | undefined => value?.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return JSON.stringify({
    source: "web",
    userId: context.userId ?? null,
    requestId: context.requestId ?? null,
    message: clean(body.message),
    url: clean(body.url),
    stack: clean(body.stack),
    componentStack: clean(body.componentStack)
  });
}

@Controller("client-errors")
class ClientErrorsController {
  private readonly logger = new Logger("ClientError");

  /** Browser crashes (React Error Boundary, unhandled rejections) so operators see them next to API logs. */
  @Post()
  @HttpCode(204)
  report(@Body() body: ClientErrorDto, @Req() request: AuthenticatedRequest & RequestWithId): void {
    this.logger.error(formatClientError(body, { userId: request.user?.id, requestId: request.requestId }));
  }
}

@Module({ controllers: [ClientErrorsController] })
export class ClientErrorsModule {}
