import mongoose, { Schema, Document } from 'mongoose';

export interface IRoute extends Document {
  start: {
    lat: number;
    lng: number;
  };
  end: {
    lat: number;
    lng: number;
  };
  waypoints: Array<{
    lat: number;
    lng: number;
  }>;
  overviewPath: Array<{
    lat: number;
    lng: number;
  }>;
  distance: string;
  duration: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

const RouteSchema: Schema = new Schema({
  start: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  end: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  waypoints: [{
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }],
  overviewPath: [{
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }],
  distance: { type: String, required: true },
  duration: { type: String, required: true },
  color: { type: String, required: true },
}, {
  timestamps: true
});

export default mongoose.model<IRoute>('Route', RouteSchema); 