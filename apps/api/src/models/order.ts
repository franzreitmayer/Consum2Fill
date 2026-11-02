import { model } from "mongoose";
import { createMovementSchema, type MovementDocument } from "./movement.js";

export const OrderModel = model<MovementDocument>("Order", createMovementSchema());
