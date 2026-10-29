import { CategoryEntity } from "./category.entity.js";
import { GameSessionEntity } from "./game-session.entity.js";
import { LobbyEntity } from "./lobby.entity.js";
import { PredictionEntity } from "./prediction.entity.js";
import { PredictionSubscriptionEntity } from "./prediction-subscription.entity.js";
import { RoleEntity } from "./role.entity.js";
import { StreamEntity } from "./stream.entity.js";
import { StreamInformationEntity } from "./stream-information.entity.js";
import { StreamParticipantEntity } from "./stream-participant.entity.js";
import { TransactionEntity } from "./transaction.entity.js";
import { UserEntity } from "./user.entity.js";

export * from "./category.entity.js";
export * from "./game-session.entity.js";
export * from "./lobby.entity.js";
export * from "./prediction.entity.js";
export * from "./prediction-subscription.entity.js";
export * from "./role.entity.js";
export * from "./stream.entity.js";
export * from "./stream-information.entity.js";
export * from "./stream-participant.entity.js";
export * from "./transaction.entity.js";
export * from "./user.entity.js";

// Schema is owned by Flyway (db/migrations); these entities only mirror it for queries.
export const entities = [
  RoleEntity, UserEntity, LobbyEntity, CategoryEntity, StreamEntity, StreamInformationEntity,
  GameSessionEntity, PredictionEntity, StreamParticipantEntity, PredictionSubscriptionEntity, TransactionEntity,
];
