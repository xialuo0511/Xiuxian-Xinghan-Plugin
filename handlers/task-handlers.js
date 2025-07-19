// /handlers/task-handlers.js (最终修正版 v5)

import { handleTribulationStrike as processTribulation } from '../logic/tribulation.js';

export async function handleTribulationStrike(task) {
  await processTribulation(task);
}