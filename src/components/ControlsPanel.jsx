import React from 'react';
import { useDetection } from '../hooks/useDetectionState';

export default function ControlsPanel() {
  const { state, autoDetectCoin, autoDetectObjects, setMode, undoLastPoint, finishManualObject } = useDetection();

  return (
    <div className="p-4 bg-gray-700 rounded-lg">
      <h2 className="text-lg font-bold mb-2">Controls</h2>
      <div className="flex flex-col gap-2">
        <button onClick={autoDetectCoin} disabled={!state.imageDataUrl || state.processing} className="px-3 py-2 bg-yellow-600 rounded">Auto Detect Coin</button>
        <button onClick={autoDetectObjects} disabled={!state.imageDataUrl || state.processing} className="px-3 py-2 bg-blue-600 rounded">Auto Detect Objects</button>
        <div className="flex gap-2">
          <button onClick={() => setMode('manual_coin')} className={`flex-1 px-3 py-2 rounded ${state.mode === 'manual_coin' ? 'bg-yellow-600' : 'bg-gray-600'}`}>Manual Coin</button>
          <button onClick={() => setMode('create_object')} className={`flex-1 px-3 py-2 rounded ${state.mode === 'create_object' ? 'bg-green-600' : 'bg-gray-600'}`}>Create Object</button>
        </div>
        <div className="flex gap-2">
          <button onClick={undoLastPoint} disabled={!state.creatingPoints.length} className="px-3 py-2 bg-gray-600 rounded">Undo Point</button>
          <button onClick={finishManualObject} disabled={!state.creatingPoints.length} className="px-3 py-2 bg-green-600 rounded">Finish Object</button>
        </div>

        <div className="mt-3 text-sm text-gray-300">
          <div>PPM: {state.ppm ? state.ppm.toFixed(2) + ' px/mm' : '—'}</div>
          <div>Coin Diameter: {state.coinDiameter ? state.coinDiameter.toFixed(1) + ' px' : '—'}</div>
        </div>
      </div>
    </div>
  );
}