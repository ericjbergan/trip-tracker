import express from 'express';
import Route from '../models/Route';
import Marker from '../models/Marker';
import RouteState from '../models/RouteState';
import { Request, Response } from 'express';

const router = express.Router();

// Get all routes
router.get('/routes', async (req, res) => {
  try {
    console.log('Fetching all routes...');
    const routes = await Route.find().sort({ createdAt: -1 });
    console.log(`Found ${routes.length} routes`);
    res.json(routes);
  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({ message: 'Error fetching routes', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Save a route
router.post('/routes', async (req, res) => {
  try {
    console.log('Saving new route:', req.body);
    // Remove _id field if it exists to let MongoDB generate it
    const { _id, ...routeData } = req.body;
    const route = new Route(routeData);
    const savedRoute = await route.save();
    console.log('Route saved successfully:', savedRoute._id);
    res.status(201).json(savedRoute);
  } catch (error) {
    console.error('Error saving route:', error);
    res.status(400).json({ message: 'Error saving route', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Delete a route
router.delete('/routes/:id', async (req, res) => {
  try {
    console.log('Deleting route:', req.params.id);
    const deletedRoute = await Route.findByIdAndDelete(req.params.id);
    if (!deletedRoute) {
      console.log('Route not found:', req.params.id);
      return res.status(404).json({ message: 'Route not found' });
    }
    console.log('Route deleted successfully:', req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting route:', error);
    res.status(400).json({ message: 'Error deleting route', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Get all markers
router.get('/markers', async (req, res) => {
  try {
    console.log('Fetching all markers...');
    const markers = await Marker.find().sort({ createdAt: -1 });
    console.log(`Found ${markers.length} markers`);
    res.json(markers);
  } catch (error) {
    console.error('Error fetching markers:', error);
    res.status(500).json({ message: 'Error fetching markers', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Save a marker
router.post('/markers', async (req, res) => {
  try {
    console.log('Saving new marker:', req.body);
    const marker = new Marker(req.body);
    const savedMarker = await marker.save();
    console.log('Marker saved successfully:', savedMarker._id);
    res.status(201).json(savedMarker);
  } catch (error) {
    console.error('Error saving marker:', error);
    res.status(400).json({ message: 'Error saving marker', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Delete a marker
router.delete('/markers/:id', async (req, res) => {
  try {
    console.log('Deleting marker:', req.params.id);
    const deletedMarker = await Marker.findByIdAndDelete(req.params.id);
    if (!deletedMarker) {
      console.log('Marker not found:', req.params.id);
      return res.status(404).json({ message: 'Marker not found' });
    }
    console.log('Marker deleted successfully:', req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting marker:', error);
    res.status(400).json({ message: 'Error deleting marker', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.put('/routes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const routeData = req.body;

    console.log('Updating route:', {
      id,
      updates: {
        color: routeData.color,
        start: routeData.start,
        end: routeData.end
      }
    });

    const updatedRoute = await Route.findByIdAndUpdate(
      id,
      { $set: routeData },
      { new: true, runValidators: true }
    );

    if (!updatedRoute) {
      return res.status(404).json({ message: 'Route not found' });
    }

    console.log('Route updated successfully:', {
      id: updatedRoute._id,
      color: updatedRoute.color
    });

    res.json(updatedRoute);
  } catch (error) {
    console.error('Error updating route:', error);
    res.status(500).json({ message: 'Error updating route', error });
  }
});

// Get current route state
router.get('/route-state', async (req: Request, res: Response) => {
  try {
    console.log('Fetching route state...');
    let state = await RouteState.findOne();
    
    // If no state exists, create initial state
    if (!state) {
      console.log('No route state found, creating initial state');
      state = await RouteState.create({
        routeStep: 'waypoint',
        startLocation: null
      });
    }
    
    console.log('Current route state:', {
      routeStep: state.routeStep,
      hasStartLocation: !!state.startLocation
    });
    
    res.json(state);
  } catch (error) {
    console.error('Error fetching route state:', error);
    res.status(500).json({ message: 'Error fetching route state', error });
  }
});

// Update route state
router.put('/route-state', async (req: Request, res: Response) => {
  try {
    console.log('Updating route state:', req.body);
    const { routeStep, startLocation } = req.body;
    
    let state = await RouteState.findOne();
    
    if (!state) {
      console.log('No route state found, creating new state');
      state = await RouteState.create({
        routeStep,
        startLocation
      });
    } else {
      console.log('Updating existing route state');
      state.routeStep = routeStep;
      state.startLocation = startLocation;
      await state.save();
    }
    
    console.log('Route state updated:', {
      routeStep: state.routeStep,
      hasStartLocation: !!state.startLocation
    });
    
    res.json(state);
  } catch (error) {
    console.error('Error updating route state:', error);
    res.status(500).json({ message: 'Error updating route state', error });
  }
});

export default router; 