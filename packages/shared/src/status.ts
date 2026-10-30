// packages/shared/src/status.ts
// Giá trị khớp CHECK constraint trong db/migrations (Flyway). Đổi ở đây thì phải có migration tương ứng.

export enum UserStatus {
  ACTIVE = "ACTIVE",
  DEACTIVE = "DEACTIVE",
  DELETED = "DELETED",
}

// lobbies / categories / streams
export enum CatalogStatus {
  ACTIVE = "ACTIVE",
  DEACTIVE = "DEACTIVE",
  ARCHIVE = "ARCHIVE",
}

export enum GameSessionStatus {
  RUNNING = "RUNNING",
  FINISHED = "FINISHED",
  CANCELLED = "CANCELLED",
}
