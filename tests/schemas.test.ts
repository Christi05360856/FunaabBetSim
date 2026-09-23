import { describe, expect, it } from "vitest";
import { registerSchema } from "@/lib/validation/schemas";

describe("registerSchema", () => {
  it("accepts a valid registration payload", () => {
    const result = registerSchema.safeParse({
      email: "player@example.com",
      password: "correct-horse",
      displayName: "Ada",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      email: "player@example.com",
      password: "short",
      displayName: "Ada",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "correct-horse",
      displayName: "Ada",
    });
    expect(result.success).toBe(false);
  });
});
