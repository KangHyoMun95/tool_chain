/**
 * Shared types & DTO contracts used by both apps/api (NestJS) and apps/web (Next.js).
 *
 * Domain: ToolHackChain — 3-tier hierarchy Admin(Host) -> Admin(Con) -> User.
 * See CLAUDE.md for the full permission model. Keep this package free of
 * runtime dependencies so it can be imported from any environment.
 */

/** The three roles that drive all authorization in the system. */
export enum Role {
  HOST = 'HOST',
  ADMIN_CON = 'ADMIN_CON',
  USER = 'USER',
}

/** Marks whether an account is usable or has been deactivated. */
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface BaseAccount {
  id: string;
  username: string;
  role: Role;
  status: AccountStatus;
  points: number;
  createdAt: string;
  updatedAt: string;
}

/** An Admin(Con): created & funded by the Host; manages its own Users. */
export interface AdminCon extends BaseAccount {
  role: Role.ADMIN_CON;
  /** FK -> Admin(Host).id */
  hostId: string;
}

/** A User: belongs to exactly one Admin(Con). */
export interface User extends BaseAccount {
  role: Role.USER;
  /** FK -> AdminCon.id */
  managedByAdminConId: string;
}

/** Direction of a points movement, always recorded for audit. */
export enum PointDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

/** Which kind of account a points transaction targets. */
export enum PointTargetType {
  ADMIN_CON = 'ADMIN_CON',
  USER = 'USER',
}

export interface PointTransaction {
  id: string;
  /** Admin (Host or Con) who initiated the change. */
  fromAdminId: string;
  toEntityType: PointTargetType;
  toEntityId: string;
  /** Signed: positive = credit, negative = debit. */
  amount: number;
  reason?: string;
  createdAt: string;
}

/**
 * Homepage configuration owned by the Host, per Admin(Con), read by that
 * Admin(Con)'s Users. Content shape is intentionally open (JSON) until the
 * page-builder mechanism is decided — see CLAUDE.md.
 */
export interface HomepageConfig {
  id: string;
  adminConId: string;
  /** Free-form JSON config; structure TBD. */
  content: Record<string, unknown>;
  updatedAt: string;
}

// ----- Auth DTO contracts -----

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  role: Role;
}

/** Decoded JWT claims carried on every authenticated request. */
export interface JwtPayload {
  /** Account id (subject). */
  sub: string;
  role: Role;
}

// ----- Example admin DTO contracts (extend as endpoints are built) -----

export interface CreateAdminConDto {
  username: string;
  password: string;
  initialPoints?: number;
}

export interface CreateUserDto {
  username: string;
  password: string;
}

export interface AdjustPointsDto {
  amount: number;
  direction: PointDirection;
  reason?: string;
}

export const API_PREFIX = 'api';
