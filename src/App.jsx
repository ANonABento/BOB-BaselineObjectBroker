import React from 'react';
import ImageUploader from './components/ImageUploader';
import DetectionCanvas from './components/DetectionCanvas';
import ControlsPanel from './components/ControlsPanel';
import ResultsPanel from './components/ResultsPanel';
import { DetectionProvider } from './hooks/useDetectionState';
import './App.css';

export default function App() {
  return (
    <DetectionProvider>
      <div className="min-h-screen bg-gray-900 text-white">
        <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">BOB - Baseline Object Broker</h1>
            <div className="flex items-center gap-3">
              {/* add global actions here if needed */}
            </div>
          </div>
        </header>

        <main className="flex h-[calc(100vh-80px)]">
          <section className="flex-1 p-4 overflow-auto bg-gray-800">
            <div className="max-w-[1280px] mx-auto">
              <ImageUploader />

              <div className="mt-4 flex gap-4 items-start">
                <div className="flex-1">
                  <DetectionCanvas />
                </div>

                <aside className="w-96">
                  <ControlsPanel />
                  <ResultsPanel />
                </aside>
              </div>
            </div>
          </section>
        </main>
      </div>
    </DetectionProvider>
  );
}