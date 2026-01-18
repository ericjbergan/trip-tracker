import mongoose, { Schema, Document } from 'mongoose';

export interface IMarker extends Document {
  position: {
    lat: number;
    lng: number;
  };
  name?: string;
  isLarge?: boolean;
  color?: string;
  showLabel?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MarkerSchema: Schema = new Schema({
  position: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  name: { type: String },
  isLarge: { type: Boolean, default: false },
  color: { type: String, default: '#FF0000' },
  showLabel: { type: Boolean, default: true }
}, {
  timestamps: true
});

export default mongoose.model<IMarker>('Marker', MarkerSchema); 