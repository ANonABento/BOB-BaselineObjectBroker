import React from 'react';
import { useDetection } from '../hooks/useDetectionState';

export default function ResultsPanel() {
  const { state, deleteObject } = useDetection();

  return (
    <div className="mt-4 p-4 bg-gray-700 rounded-lg">
      <h3 className="text-lg font-bold mb-2">Objects</h3>
      {state.objects.length === 0 ? (
        <div className="text-gray-400">No objects detected</div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {state.objects.map(obj => (
            <div key={obj.id} className="p-2 bg-gray-600 rounded flex flex-col">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">{obj.name}</div>
                  <div className="text-xs text-gray-300">{obj.edges?.length || 0} edges • {obj.isCoin ? 'Reference' : 'Object'}</div>
                </div>
                <div className="flex flex-col items-end">
                  {!obj.isCoin && (
                    <div className="text-sm font-mono">
                      {state.ppm ? `${obj.perimeter?.toFixed?.(1) || obj.perimeter} px` : `${obj.perimeter?.toFixed?.(1) || obj.perimeter} px`}
                    </div>
                  )}
                  <button onClick={() => deleteObject(obj.id)} className="text-red-400">Delete</button>
                </div>
              </div>

              {obj.edges && (
                <div className="mt-2 space-y-1">
                  {obj.edges.map((e, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <div>Edge {i + 1}</div>
                      <div className="font-mono">{e.realLength ? `${e.realLength.toFixed(1)} mm` : `${e.pixelLength.toFixed(1)} px`}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}