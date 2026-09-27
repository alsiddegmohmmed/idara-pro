import { Injectable, UnauthorizedException } from "@nestjs/common";
import { verifyPassword } from "../../../shared/auth/password";
import { UsersRepository } from "../infrastructure/users.repository";
import { IssueSessionUseCase, type SessionTokens } from "./issue-session.use-case";

export type { SessionTokens };

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly users: UsersRepository,
    private readonly issueSession: IssueSessionUseCase,
  ) {}

  async execute(email: string, password: string): Promise<SessionTokens> {
    // Same error for "no such user" and "wrong password" — don't reveal which.
    const user = await this.users.findByEmailAcrossCompanies(email);
    if (!user || user.status !== "active") {
      throw new UnauthorizedException();
    }

    const validPassword = await verifyPassword(user.passwordHash, password);
    if (!validPassword) {
      throw new UnauthorizedException();
    }

    return this.issueSession.execute(user);
  }
}
