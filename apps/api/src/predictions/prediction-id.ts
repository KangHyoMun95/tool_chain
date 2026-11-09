// src/predictions/prediction-id.ts
import { PREDICTION_NAMESPACE } from "@toolhackchain/shared";
import { uuidV5 } from "../game-sessions/game-session-id.js";

/** Cùng một ván luôn ra cùng prediction_id (khớp prediction_id() bên apps/ai/src/patterns/contract.py). */
export const predictionId = (gameSessionId: string): string => uuidV5(gameSessionId, PREDICTION_NAMESPACE);
