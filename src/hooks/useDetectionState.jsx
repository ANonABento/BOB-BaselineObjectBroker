import React, { createContext, useContext, useState, useEffect } from 'react';
import * as cvUtils from '../opencvUtils';

const DetectionContext = createContext(null);

export function DetectionProvider({ children }) {
  const [state, setState] = useState({
    imageFile: null,
    imageDataUrl: null,
    imageObject: null,
    processing: false,
    processingText: '',
    objects: [],
    ppm: null,
    coinDiameter: null,
    mode: 'select', // select | manual_coin | create_object
    manualCoinPoints: [],
    creatingPoints: []
  });

  // convenience setters
  const setImageFile = async ({ file, dataUrl }) => {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = dataUrl; });
    setState(prev => ({ ...prev, imageFile: file, imageDataUrl: dataUrl, imageObject: img }));
  };

  const setMode = (m) => setState(prev => ({ ...prev, mode: m }));

  const setProcessing = (flag, text = '') => setState(prev => ({ ...prev, processing: flag, processingText: text }));

  // Auto detect coin only
  const autoDetectCoin = async () => {
    if (!state.imageDataUrl) return;
    try {
      setProcessing(true, 'Detecting coin...');
      const pixelDistance = await cvUtils.detectCoin(state.imageDataUrl);
      const ppm = cvUtils.calculatePPM(pixelDistance);
      const coinObj = {
        id: `coin_${Date.now()}`,
        name: 'Coin (Reference)',
        isCoin: true,
        pixelDistance,
        perimeter: cvUtils.COIN_DIAMETER_MM * Math.PI,
        measurements: { diameter: cvUtils.COIN_DIAMETER_MM },
        color: '#F59E0B',
        center: { x: state.imageObject.width / 2, y: state.imageObject.height / 2 }
      };

      // detect contours too and skip coin region
      const raw = await cvUtils.detectContours(state.imageDataUrl);
      const objects = raw.filter(r => !r.isCoin).map(o => cvUtils.applyPPMToObject(o, ppm));

      setState(prev => ({ ...prev, ppm, coinDiameter: pixelDistance, objects: [coinObj, ...objects] }));
    } catch (err) {
      console.error(err);
      alert('Auto coin detection failed. Try manual calibration.');
    } finally {
      setProcessing(false);
    }
  };

  // Auto detect objects only (keeps current ppm if exists)
  const autoDetectObjects = async () => {
    if (!state.imageDataUrl) return;
    try {
      setProcessing(true, 'Detecting objects...');
      const raw = await cvUtils.detectContours(state.imageDataUrl);
      const coin = raw.find(r => r.isCoin);
      let ppm = state.ppm;
      if (!ppm && coin) {
        ppm = cvUtils.calculatePPM(coin.pixelDistance);
      }
      const objects = raw.filter(r => !r.isCoin).map(o => ppm ? cvUtils.applyPPMToObject(o, ppm) : o);
      // include coin object if we have coin data
      const coinObj = coin ? {
        id: `coin_${Date.now()}`,
        name: 'Coin (Reference)',
        isCoin: true,
        pixelDistance: coin.pixelDistance,
        measurements: { diameter: cvUtils.COIN_DIAMETER_MM },
        color: '#F59E0B',
        center: coin.center || null
      } : null;

      setState(prev => ({ ...prev, ppm: ppm || prev.ppm, coinDiameter: coin ? coin.pixelDistance : prev.coinDiameter, objects: coinObj ? [coinObj, ...objects] : objects }));
    } catch (err) {
      console.error(err);
      alert('Object detection failed');
    } finally {
      setProcessing(false);
    }
  };

  const autoDetectAll = async () => {
    // Detect coin and objects in sequence. This is used right after upload.
    if (!state.imageDataUrl) return;
    try {
      setProcessing(true, 'Auto-detecting coin and objects...');
      const pixelDistance = await cvUtils.detectCoin(state.imageDataUrl);
      const ppm = cvUtils.calculatePPM(pixelDistance);
      const raw = await cvUtils.detectContours(state.imageDataUrl);
      const objects = raw.filter(r => !r.isCoin).map(o => cvUtils.applyPPMToObject(o, ppm));
      const coinObj = {
        id: `coin_${Date.now()}`,
        name: 'Coin (Reference)',
        isCoin: true,
        pixelDistance,
        measurements: { diameter: cvUtils.COIN_DIAMETER_MM },
        color: '#F59E0B',
        center: raw.find(r => r.isCoin)?.center || null
      };
      setState(prev => ({ ...prev, ppm, coinDiameter: pixelDistance, objects: [coinObj, ...objects] }));
    } catch (err) {
      console.error(err);
      // If automatic fails, keep image but notify user and fall back to manual
      alert('Auto-detection failed. You may try manual coin calibration or adjust the image/background.');
    } finally {
      setProcessing(false);
    }
  };

  // Manual coin points handling
  const setManualCoinPoints = ({ x, y }) => {
    setState(prev => {
      const pts = [...prev.manualCoinPoints, { x, y }];
      if (pts.length === 2) {
        // compute distance and ppm and apply
        const pixelDistance = cvUtils.calculatePixelDistance(pts[0], pts[1]);
        const ppm = cvUtils.calculatePPM(pixelDistance);
        // create coin object and apply ppm to existing objects
        const coinObj = {
          id: `coin_${Date.now()}`,
          name: 'Coin (Reference)',
          isCoin: true,
          pixelDistance,
          measurements: { diameter: cvUtils.COIN_DIAMETER_MM },
          color: '#F59E0B',
          center: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
        };
        const calibrated = prev.objects.filter(o => !o.isCoin).map(o => cvUtils.applyPPMToObject(o, ppm));
        return { ...prev, manualCoinPoints: [], ppm, coinDiameter: pixelDistance, objects: [coinObj, ...calibrated], mode: 'select' };
      }
      return { ...prev, manualCoinPoints: pts };
    });
  };

  // Manual object creation
  const addManualObjectPoint = (p) => {
    setState(prev => {
      const pts = [...prev.creatingPoints, p];
      // if near first point, close polygon
      if (pts.length > 2) {
        const first = pts[0];
        const dx = p.x - first.x;
        const dy = p.y - first.y;
        if (Math.hypot(dx, dy) < 10) {
          // finish with pts minus last (duplicate)
          finishManualObject(pts.slice(0, -1));
          return { ...prev, creatingPoints: [] };
        }
      }
      return { ...prev, creatingPoints: pts };
    });
  };

  const undoLastPoint = () => setState(prev => ({ ...prev, creatingPoints: prev.creatingPoints.slice(0, -1) }));

  const finishManualObject = (points = null) => {
    setState(prev => {
      const pts = points || prev.creatingPoints;
      if (!pts || pts.length < 3) {
        alert('At least 3 points are needed to create an object');
        return { ...prev, creatingPoints: [] };
      }

      // bbox
      const xs = pts.map(p => p.x);
      const ys = pts.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // edges + perimeter
      const edges = [];
      let perimeter = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const len = cvUtils.calculatePixelDistance(a, b);
        perimeter += len;
        edges.push({ start: a, end: b, pixelLength: len, realLength: null });
      }

      // area (shoelace)
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      }
      area = Math.abs(area) / 2;

      const nextIndex = prev.objects.filter(o => !o.isCoin).length + 1;
      const newObj = {
        id: `manual_${Date.now()}_${nextIndex}`,
        name: `Object ${nextIndex}`,
        color: ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6'][nextIndex % 5],
        contour: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        points: pts,
        edges,
        area,
        perimeter,
        isCoin: false,
        measurements: { edges: edges.map(e => ({ pixelLength: e.pixelLength, realLength: null })), perimeter: perimeter }
      };

      const final = prev.ppm ? cvUtils.applyPPMToObject(newObj, prev.ppm) : newObj;
      return { ...prev, objects: [...prev.objects, final], creatingPoints: [], mode: 'select' };
    });
  };

  const deleteObject = (id) => setState(prev => ({ ...prev, objects: prev.objects.filter(o => o.id !== id) }));

  // expose API via context
  const value = {
    state,
    setImageFile,
    setMode,
    setProcessing,
    autoDetectCoin,
    autoDetectObjects,
    autoDetectAll,
    setManualCoinPoints,
    addManualObjectPoint,
    undoLastPoint,
    finishManualObject,
    deleteObject,
    startManualObjectPoint: () => setMode('create_object')
  };

  return <DetectionContext.Provider value={value}>{children}</DetectionContext.Provider>;
}

export function useDetection() {
  const ctx = useContext(DetectionContext);
  if (!ctx) throw new Error('useDetection must be used within DetectionProvider');
  return ctx;
}
