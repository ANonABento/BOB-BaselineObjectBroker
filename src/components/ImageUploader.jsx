import React, { useRef } from 'react';
import { useDetection } from '../hooks/useDetectionState';

export default function ImageUploader() {
  const { setImageFile, autoDetectAll, state } = useDetection();
  const ref = useRef();

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      // Convert to Image object on the hook side
      await setImageFile({ file, dataUrl });
      // Immediately auto-detect coin and objects for the workflow
      await autoDetectAll();
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-4 border-2 border-dashed rounded-lg text-center bg-gray-800">
      <input ref={ref} type="file" accept="image/*" onChange={handleChange} className="hidden" />
      <div className="flex flex-col items-center gap-3">
        <p className="text-gray-300">Upload an image to begin. The app will automatically detect a coin (for ppm) and objects.</p>
        <div className="flex gap-2">
          <button onClick={() => ref.current?.click()} className="px-4 py-2 bg-blue-600 rounded">Choose Image</button>
          <button onClick={autoDetectAll} disabled={!state.imageDataUrl || state.processing} className="px-4 py-2 bg-gray-700 rounded disabled:opacity-40">Auto Detect</button>
        </div>
        {state.processing && <div className="text-sm text-yellow-300">{state.processingText}</div>}
      </div>
    </div>
  );
}