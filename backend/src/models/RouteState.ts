import mongoose, { Schema, Document } from 'mongoose';

export interface IRouteState extends Document {
  routeStep: 'start' | 'waypoint' | 'end';
  startLocation: {
    lat: number;
    lng: number;
  } | null;
  updatedAt: Date;
}

const RouteStateSchema: Schema = new Schema({
  routeStep: {
    type: String,
    enum: ['start', 'waypoint', 'end'],
    required: true
  },
  startLocation: {
    lat: { type: Number },
    lng: { type: Number }
  }
}, {
  timestamps: true
});

// Ensure only one document exists
RouteStateSchema.pre('save', async function(next) {
  const count = await mongoose.model('RouteState').countDocuments();
  if (count > 0 && this.isNew) {
    throw new Error('Only one route state document can exist');
  }
  next();
});

export default mongoose.model<IRouteState>('RouteState', RouteStateSchema); 