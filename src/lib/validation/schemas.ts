import { z } from "zod";

// Boundary validation for the registration/login forms and API routes —
// never trust input just because it came from a form.
export const registerSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;
