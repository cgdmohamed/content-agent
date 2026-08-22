import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { toApiErrorResponse, withRequestId } from "../api-exception-filter";

describe("api exception filter", () => {
  it("keeps expected Arabic HTTP exception messages", () => {
    const response = toApiErrorResponse(new BadRequestException("اسم الموقع مطلوب."), true);

    expect(response).toMatchObject({
      statusCode: 400,
      message: "اسم الموقع مطلوب."
    });
  });

  it("keeps expected structured HTTP exception details", () => {
    const response = toApiErrorResponse(
      new BadRequestException({
        message: "كل موضوعات الدفعة تبدو مكررة.",
        rejected: [{ topic: "موضوع مكرر" }]
      }),
      true
    );

    expect(response.statusCode).toBe(400);
    expect(response.message).toBe("كل موضوعات الدفعة تبدو مكررة.");
    expect(response.rejected).toEqual([{ topic: "موضوع مكرر" }]);
  });

  it("hides unexpected exception details in production", () => {
    const response = toApiErrorResponse(new Error("database password leaked in stack"), true);

    expect(response).toEqual({
      statusCode: 500,
      message: "حدث خطأ غير متوقع. حاول مرة أخرى لاحقًا.",
      error: "Internal Server Error"
    });
  });

  it("keeps unexpected messages outside production for debugging", () => {
    const response = toApiErrorResponse(new Error("local debug detail"), false);

    expect(response.message).toBe("local debug detail");
  });

  it("normalizes expected validation message arrays", () => {
    const response = toApiErrorResponse(new InternalServerErrorException({ message: ["خطأ أول", 123, ""] }), true);

    expect(response.message).toEqual(["خطأ أول", "123"]);
  });

  it("adds the request id when available", () => {
    const response = withRequestId(toApiErrorResponse(new BadRequestException("طلب غير صالح."), true), "req-12345678");

    expect(response.requestId).toBe("req-12345678");
  });
});
