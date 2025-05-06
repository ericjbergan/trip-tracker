import mongoose, { Schema, Document } from 'mongoose';

export interface IMarker extends Document {
  position: {
    lat: number;
    lng: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const MarkerSchema: Schema = new Schema({
  position: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  }
}, {
  timestamps: true
});

export default mongoose.model<IMarker>('Marker', MarkerSchema); 