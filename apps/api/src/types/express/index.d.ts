import { AuthenticatedUser } from "..";
import { SessionClaims } from "../../lib/tokens";

declare global {
  namespace Express {
    export interface Request {
      user?: AuthenticatedUser;
      sessionClaims?: SessionClaims;
    }
  }
}
