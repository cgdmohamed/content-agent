import { describe, expect, it } from "vitest";
import { validationExceptionFactory, validationMessages } from "../validation-errors";

describe("Arabic validation errors", () => {
  it("translates common validation constraints", () => {
    const messages = validationMessages([
      {
        property: "email",
        constraints: { isEmail: "email must be an email" }
      },
      {
        property: "ideasCount",
        constraints: { max: "ideasCount must not be greater than 20" }
      },
      {
        property: "extraField",
        constraints: { whitelistValidation: "property extraField should not exist" }
      }
    ]);

    expect(messages).toEqual([
      "البريد الإلكتروني يجب أن يكون بريدًا إلكترونيًا صالحًا.",
      "عدد الأفكار أكبر من الحد المسموح.",
      "الحقل غير مسموح به في هذا الطلب."
    ]);
  });

  it("returns a BadRequestException with Arabic message array", () => {
    const exception = validationExceptionFactory([{ property: "draftHtml", constraints: { maxLength: "too long" } }]);
    const response = exception.getResponse() as { message: string[] };

    expect(response.message).toEqual(["محتوى المقال أطول من الحد المسموح."]);
  });
});
