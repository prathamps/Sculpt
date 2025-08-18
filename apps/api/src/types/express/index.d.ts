// src/types/express/index.d.ts
import { AuthenticatedUser } from "..";

declare global {
  namespace Express {
    export interface Request {
      user?: AuthenticatedUser;
    }
  }
}
