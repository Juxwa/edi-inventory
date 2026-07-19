import { z } from "zod";

export type UserActionState = {
  ok: boolean;
  error?: string;
};

export const initialUserState: UserActionState = { ok: false };

function toOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const optionalUuid = z.preprocess(toOptionalText, z.string().uuid().nullable());

const requiredUuid = z.preprocess(
  toOptionalText,
  z.string({ required_error: "Required" }).uuid({ message: "Required" }),
);

const requiredText = z.preprocess(
  toOptionalText,
  z.string({ required_error: "Required" }).min(1, "Required"),
);

export const USER_ROLES = ["admin", "branch_rep", "top_mgmt", "technical"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const roleWithBranch = z
  .object({
    role: z.enum(USER_ROLES),
    branch_id: optionalUuid,
  })
  .superRefine((data, ctx) => {
    if (data.role === "branch_rep" && !data.branch_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Branch reps must be assigned a branch.",
        path: ["branch_id"],
      });
    }
  });

export const inviteUserSchema = z
  .object({
    email: z.preprocess(
      toOptionalText,
      z.string({ required_error: "Required" }).email("Enter a valid email"),
    ),
    name: requiredText,
  })
  .and(roleWithBranch);
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z
  .object({
    user_id: requiredUuid,
    name: requiredText,
  })
  .and(roleWithBranch);
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const setActiveSchema = z.object({
  user_id: requiredUuid,
  active: z.preprocess((value: unknown) => {
    if (typeof value === "string") return value.trim().toLowerCase() === "true";
    return Boolean(value);
  }, z.boolean()),
});
export type SetActiveInput = z.infer<typeof setActiveSchema>;
