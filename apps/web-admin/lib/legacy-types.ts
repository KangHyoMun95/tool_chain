// Kiểu dữ liệu dùng chung của các trang web-admin (trạng thái tài khoản, điểm, dashboard); không nằm trong @toolhackchain/shared.

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum PointDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum PointTargetType {
  ADMIN_CON = 'ADMIN_CON',
  USER = 'USER',
}

export interface DashboardDailyPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  value: number;
}

export interface DashboardResponse {
  totalUsers: number;
  activeUsers: number;
  inactive7Days: number;
  totalUnusedPoints: number;
  createdPerDay: DashboardDailyPoint[];
  pointsUsedPerDay: DashboardDailyPoint[];
}
