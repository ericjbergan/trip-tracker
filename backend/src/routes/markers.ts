import express from 'express';
import Marker from '../models/Marker';

const router = express.Router();

// Get all markers
router.get('/', async (req, res) => {
  try {
    const markers = await Marker.find().sort({ createdAt: -1 });
    res.json(markers);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching markers', error });
  }
});

// Create a new marker
router.post('/', async (req, res) => {
  try {
    const marker = new Marker(req.body);
    const savedMarker = await marker.save();
    res.status(201).json(savedMarker);
  } catch (error) {
    res.status(400).json({ message: 'Error creating marker', error });
  }
});

// Delete a marker
router.delete('/:id', async (req, res) => {
  try {
    const marker = await Marker.findByIdAndDelete(req.params.id);
    if (!marker) {
      return res.status(404).json({ message: 'Marker not found' });
    }
    res.json({ message: 'Marker deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting marker', error });
  }
});

export default router; 