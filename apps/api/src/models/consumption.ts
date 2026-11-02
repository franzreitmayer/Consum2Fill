import { model } from "mongoose";
import { createMovementSchema, type MovementDocument } from "./movement.js";

export const ConsumptionModel = model<MovementDocument>("Consumption", createMovementSchema());
