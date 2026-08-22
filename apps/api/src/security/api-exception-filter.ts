import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";

export type ApiErrorResponse = {
  statusCode: number;
  message: string | string[];
  error?: string;
  requestId?: string;
  [key: string]: unknown;
};

type ErrorLike = {
  message?: unknown;
  error?: unknown;
  statusCode?: unknown;
};

const genericUnexpectedMessage = "حدث خطأ غير متوقع. حاول مرة أخرى لاحقًا.";

export function toApiErrorResponse(exception: unknown, isProduction: boolean): ApiErrorResponse {
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === "string") {
      return {
        statusCode,
        message: response,
        error: exception.name
      };
    }
    if (isRecord(response)) {
      const body = response as ErrorLike;
      return {
        ...response,
        statusCode,
        message: normalizeExpectedMessage(body.message, exception.message),
        error: typeof body.error === "string" ? body.error : exception.name
      };
    }
    return {
      statusCode,
      message: exception.message || genericUnexpectedMessage,
      error: exception.name
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: isProduction ? genericUnexpectedMessage : normalizeUnexpectedMessage(exception),
    error: "Internal Server Error"
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<{ requestId?: string }>();
    const response = context.getResponse<{ status: (statusCode: number) => { json: (body: ApiErrorResponse) => void } }>();
    const isProduction = process.env.NODE_ENV === "production";
    const body = withRequestId(toApiErrorResponse(exception, isProduction), request.requestId);

    if (!(exception instanceof HttpException)) {
      console.error("Unhandled API exception", { requestId: request.requestId, exception });
    }

    response.status(body.statusCode).json(body);
  }
}

export function withRequestId(body: ApiErrorResponse, requestId: string | undefined): ApiErrorResponse {
  if (!requestId) return body;
  return { ...body, requestId };
}

function normalizeExpectedMessage(message: unknown, fallback: string): string | string[] {
  if (Array.isArray(message)) return message.map((item) => String(item)).filter(Boolean);
  if (typeof message === "string" && message.trim()) return message;
  return fallback || genericUnexpectedMessage;
}

function normalizeUnexpectedMessage(exception: unknown): string {
  if (exception instanceof Error && exception.message.trim()) return exception.message;
  if (typeof exception === "string" && exception.trim()) return exception;
  return genericUnexpectedMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
