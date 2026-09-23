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
export const matchWinnerMarketSchema = z.object({
  matchId: z.string().min(1),
  homeOdds: z.number().min(1.01).max(1000),
  drawOdds: z.number().min(1.01).max(1000),
  awayOdds: z.number().min(1.01).max(1000),
});
export type MatchWinnerMarketInput = z.infer<typeof matchWinnerMarketSchema>;
export const placeBetSchema = z.object({
  matchId: z.string().min(1),
  marketId: z.string().min(1),
  selectionId: z.string().min(1),
  stake: z.number().int().positive(),
});
export type PlaceBetInput = z.infer<typeof placeBetSchema>;
