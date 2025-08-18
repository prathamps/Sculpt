import { User, ProjectMember } from "@prisma/client";
import { Request } from "express";

export type AuthenticatedUser = Omit<User, "password">;

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export type ProjectMemberWithUser = ProjectMember & { user: User };