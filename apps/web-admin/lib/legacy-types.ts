// Kiểu dữ liệu của các trang web-admin chưa nối API mới (dashboard, quản lý admin / user, cấp điểm). Trước đây nằm trong
// @toolhackchain/shared nhưng đã bị gỡ khỏi shared từ lâu (API thật không còn các endpoint này). Mỗi trang sẽ được dựng lại
// theo API thật rồi xóa kiểu tương ứng ở đây; không thêm lại vào shared.

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
