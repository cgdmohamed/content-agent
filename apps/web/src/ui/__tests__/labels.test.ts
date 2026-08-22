import { describe, expect, it } from "vitest";
import { eventTypeLabel, operationLabel, providerLabel, queueLabel } from "../labels";

describe("Arabic UI labels", () => {
  it("translates production queue names used by the worker", () => {
    expect(queueLabel("content-image")).toBe("طابور الصور");
    expect(queueLabel("wordpress-publish")).toBe("طابور النشر على ووردبريس");
  });

  it("does not expose raw backend codes for unknown labels", () => {
    expect(operationLabel("NEW_BACKEND_OPERATION")).toBe("عملية غير معروفة");
    expect(queueLabel("new-backend-queue")).toBe("طابور غير معروف");
    expect(providerLabel("new-provider")).toBe("مزود غير معروف");
    expect(eventTypeLabel("NEW_BACKEND_EVENT")).toBe("حدث غير معروف");
  });
});
