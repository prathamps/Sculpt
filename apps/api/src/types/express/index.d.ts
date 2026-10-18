import { AuthenticatedUser } from "..";
import { SessionClaims } from "../../lib/tokens";
import { RequestAuth } from "../../lib/request-auth";

declare global {
  namespace Express {
    export interface Request {
      user?: AuthenticatedUser;
      sessionClaims?: SessionClaims;
      auth?: RequestAuth;
    }
  }
}
